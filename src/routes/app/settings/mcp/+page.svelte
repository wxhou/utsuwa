<script lang="ts">
	import { onMount } from 'svelte';
	import { mcpStore } from '$lib/stores/mcp.svelte';
	import type { McpAuth, McpServerConfig, McpTransport } from '$lib/types/mcp';
	import { parseEnvLines, parseQuotedArgs } from '$lib/services/mcp/protocol';
	import { Button, Icon } from '$lib/components/ui';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { t, type DictKey } from '$lib/i18n';

	// ── Form state (shared for add + edit) ──────────────────────────────────
	let showForm = $state(false);
	let editingId = $state<string | null>(null);
	let formTransport = $state<McpTransport>('http');
	let formName = $state('');
	let formUrl = $state('');
	let formCommand = $state('');
	let formArgs = $state('');
	let formEnv = $state('');
	let formAuthType = $state<'none' | 'bearer'>('none');
	let formAuthToken = $state('');
	let formInjectResultsAsUser = $state(false);
	let formAskBeforeRun = $state(true);
	// Validation failures are our own static strings, stored as keys so the
	// message re-renders on locale switches.
	let formError = $state<DictKey | ''>('');

	const isEditing = $derived(editingId !== null);

	function resetForm() {
		formName = '';
		formUrl = '';
		formCommand = '';
		formArgs = '';
		formEnv = '';
		formAuthType = 'none';
		formAuthToken = '';
		formInjectResultsAsUser = false;
		formAskBeforeRun = true;
		formError = '';
		editingId = null;
		showForm = false;
	}

	function openAddForm() {
		resetForm();
		formTransport = 'http';
		showForm = true;
	}

	function openEditForm(server: McpServerConfig) {
		editingId = server.id;
		formTransport = server.transport;
		formName = server.name;
		formUrl = server.url ?? '';
		formCommand = server.command ?? '';
		formArgs = (server.args ?? []).join(' ');
		formEnv = server.env
			? Object.entries(server.env)
					.map(([k, v]) => `${k}=${v}`)
					.join('\n')
			: '';
		formAuthType = server.auth?.type === 'bearer' ? 'bearer' : 'none';
		formAuthToken = server.auth?.type === 'bearer' ? server.auth.token : '';
		formInjectResultsAsUser = server.injectResultsAsUser ?? false;
		formAskBeforeRun = server.askBeforeRun !== false;
		formError = '';
		showForm = true;
	}

	function submitForm() {
		formError = '';
		if (!formName.trim()) {
			formError = 'settings.mcp.errName';
			return;
		}
		if (formTransport === 'http' && !formUrl.trim()) {
			formError = 'settings.mcp.errUrl';
			return;
		}
		if (formTransport === 'stdio' && !formCommand.trim()) {
			formError = 'settings.mcp.errCommand';
			return;
		}
		if (formTransport === 'http' && formAuthType === 'bearer' && !formAuthToken.trim()) {
			formError = 'settings.mcp.errToken';
			return;
		}

		const auth: McpAuth =
			formAuthType === 'bearer' ? { type: 'bearer', token: formAuthToken.trim() } : { type: 'none' };
		const args = formArgs.trim() ? parseQuotedArgs(formArgs) : [];
		const env = formEnv.trim() ? parseEnvLines(formEnv) : undefined;

		const data = {
			name: formName.trim(),
			transport: formTransport,
			url: formTransport === 'http' ? formUrl.trim() : undefined,
			command: formTransport === 'stdio' ? formCommand.trim() : undefined,
			args: formTransport === 'stdio' ? args : undefined,
			env: formTransport === 'stdio' ? env : undefined,
			auth: formTransport === 'http' ? auth : undefined,
			injectResultsAsUser: formInjectResultsAsUser,
			askBeforeRun: formAskBeforeRun
		};

		if (isEditing) {
			mcpStore.updateServer(editingId!, data);
		} else {
			mcpStore.addServer({ ...data, enabled: true });
		}
		resetForm();
	}

	onMount(() => {
		void mcpStore.refreshTools();
	});
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.mcp.title')}</h2>
		<p>
			{t('settings.mcp.subtitle')}
		</p>
	</header>

	{#if mcpStore.capability === 'none'}
		<section class="section notice">
			<strong>{t('settings.mcp.disabledTitle')}</strong>
			<span>
				{t('settings.mcp.disabledBody', { code: 'MCP_ENABLED=server' })}
			</span>
		</section>
	{/if}

	{#if mcpStore.capability === 'client'}
		<section class="section notice info">
			<strong>{t('settings.mcp.desktopTitle')}</strong>
			<span>{t('settings.mcp.desktopBody')}</span>
		</section>
	{/if}

	{#if mcpStore.serverEnabled}
		<SettingsSection title={t('settings.mcp.servers')}>
			{#snippet actions()}
				<Button variant="secondary" onclick={() => (showForm && !isEditing ? resetForm() : openAddForm())}>
					<Icon name={showForm && !isEditing ? 'xmark' : 'plus'} size={13} />
					{showForm && !isEditing ? t('common.cancel') : t('settings.mcp.addServer')}
				</Button>
			{/snippet}

			{#if showForm}
				<div class="form-card">
					<div class="form-title">{isEditing ? t('settings.mcp.editServerTitle') : t('settings.mcp.newServer')}</div>

					<div class="form-row">
						<label class="form-label" for="mcp-name">{t('settings.mcp.name')}</label>
						<input id="mcp-name" class="settings-field" bind:value={formName} placeholder="Home Assistant" />
					</div>

					<div class="form-row">
						<span class="form-label">{t('settings.mcp.transport')}</span>
						<div class="transport-toggle">
							<label class="transport-opt">
								<input
									type="radio"
									name="mcp-transport"
									value="http"
									checked={formTransport === 'http'}
									onchange={() => (formTransport = 'http')}
								/>
								HTTP
							</label>
							<label class="transport-opt">
								<input
									type="radio"
									name="mcp-transport"
									value="stdio"
									checked={formTransport === 'stdio'}
									onchange={() => (formTransport = 'stdio')}
								/>
								stdio
							</label>
						</div>
					</div>

					{#if formTransport === 'stdio'}
						<p class="form-hint">
							{t('settings.mcp.stdioHint', {
								allowlist: 'MCP_STDIO_ALLOWED_COMMANDS',
								example: 'npx -y @brave/brave-search-mcp-server',
								env: 'MCP_STDIO_ENV_ALLOWLIST'
							})}
						</p>
					{/if}

					{#if formTransport === 'http'}
						<div class="form-row">
							<label class="form-label" for="mcp-url">{t('settings.mcp.url')}</label>
							<input
								id="mcp-url"
								class="settings-field"
								bind:value={formUrl}
								placeholder="http://homeassistant.local:8123/api/mcp"
								type="url"
							/>
						</div>
						<div class="form-row">
							<span class="form-label">{t('settings.mcp.auth')}</span>
							<div class="transport-toggle">
								<label class="transport-opt">
									<input
										type="radio"
										name="mcp-auth"
										value="none"
										checked={formAuthType === 'none'}
										onchange={() => (formAuthType = 'none')}
									/>
									{t('settings.mcp.authNone')}
								</label>
								<label class="transport-opt">
									<input
										type="radio"
										name="mcp-auth"
										value="bearer"
										checked={formAuthType === 'bearer'}
										onchange={() => (formAuthType = 'bearer')}
									/>
									{t('settings.mcp.authBearer')}
								</label>
							</div>
						</div>
						{#if formAuthType === 'bearer'}
							<div class="form-row">
								<label class="form-label" for="mcp-token">{t('settings.mcp.token')}</label>
								<input
									id="mcp-token"
									class="settings-field"
									bind:value={formAuthToken}
									placeholder={t('settings.mcp.tokenPlaceholder')}
									type="password"
								/>
							</div>
						{/if}
					{:else}
						<div class="form-row">
							<label class="form-label" for="mcp-command">{t('settings.mcp.command')}</label>
							<input id="mcp-command" class="settings-field" bind:value={formCommand} placeholder="npx" />
						</div>
						<div class="form-row">
							<label class="form-label" for="mcp-args">{t('settings.mcp.arguments')}</label>
							<input
								id="mcp-args"
								class="settings-field"
								bind:value={formArgs}
								placeholder="-y mcp-searxng"
							/>
						</div>
						<div class="form-row">
							<label class="form-label" for="mcp-env">
								{t('settings.mcp.envVars')}
								<span class="form-hint">{t('settings.mcp.envHint')}</span>
							</label>
							<textarea
								id="mcp-env"
								class="settings-field form-textarea"
								bind:value={formEnv}
								placeholder="SEARXNG_URL=http://your-searxng-host:8080"
								rows="3"
							></textarea>
						</div>
					{/if}

					{#if formError}
						<p class="form-error">{t(formError)}</p>
					{/if}

					<label class="checkbox-row">
						<input type="checkbox" bind:checked={formAskBeforeRun} />
						<span>{t('settings.mcp.askBeforeRun')}</span>
						<span class="form-hint">{t('settings.mcp.askBeforeRunHint')}</span>
					</label>

					<label class="checkbox-row">
						<input type="checkbox" bind:checked={formInjectResultsAsUser} />
						<span>{t('settings.mcp.injectText')}</span>
						<span class="form-hint">{t('settings.mcp.injectHint')}</span>
					</label>

					<div class="form-actions">
						{#if isEditing}
							<Button variant="secondary" onclick={resetForm}>{t('common.cancel')}</Button>
						{/if}
						<Button onclick={submitForm}>
							{isEditing ? t('settings.mcp.saveChanges') : t('settings.mcp.addServer')}
						</Button>
					</div>
				</div>
			{/if}

			{#if mcpStore.servers.length === 0 && !showForm}
				<p class="empty-hint">{t('settings.mcp.empty')}</p>
			{/if}

			<ul class="server-list">
				{#each mcpStore.servers as server (server.id)}
					<li class="server-card">
						<div class="server-info">
							<span class="server-name">{server.name}</span>
							<span class="server-meta">
								{server.transport === 'http'
									? server.url
									: `${server.command} ${(server.args ?? []).join(' ')}`}
							</span>
						</div>
						<div class="server-actions">
							{#if server.transport === 'http' && server.auth?.type === 'bearer'}
								<span class="ui-badge">auth</span>
							{/if}
							{#if server.askBeforeRun === false}
								<span class="ui-badge" title={t('settings.mcp.autoRunTitle')}>auto-run</span>
							{/if}
							<span class="ui-badge">{server.transport}</span>
							<Switch
								checked={server.enabled}
								onchange={() => mcpStore.toggleServer(server.id)}
								label={t('settings.mcp.enableServer', { name: server.name })}
							/>
							<Button
								variant="ghost"
								onclick={() => openEditForm(server)}
								title={t('settings.mcp.editServer')}
								aria-label={t('settings.mcp.editServer')}
							>
								<Icon name="pencil" size={13} />
							</Button>
							<Button
								variant="danger"
								onclick={() => mcpStore.removeServer(server.id)}
								title={t('settings.mcp.removeServer')}
								aria-label={t('settings.mcp.removeServer')}
							>
								<Icon name="trash" size={13} />
							</Button>
						</div>
					</li>
				{/each}
			</ul>
		</SettingsSection>

		<SettingsSection title={t('settings.mcp.availableTools')}>
			{#snippet actions()}
				<Button variant="secondary" onclick={() => mcpStore.refreshTools()} disabled={mcpStore.isLoadingTools}>
					<Icon name="refresh" size={13} />
					{mcpStore.isLoadingTools ? t('settings.mcp.loading') : t('settings.mcp.refresh')}
				</Button>
			{/snippet}

			{#if mcpStore.toolsError}
				<p class="form-error">{mcpStore.toolsError}</p>
			{/if}

			{#if mcpStore.serverErrors.length > 0}
				<ul class="server-error-list">
					{#each mcpStore.serverErrors as error (error.serverId)}
						<li class="form-error">
							<strong>{error.serverName}:</strong>
							{error.message}
						</li>
					{/each}
				</ul>
			{/if}

			{#if mcpStore.tools.length === 0 && !mcpStore.isLoadingTools && mcpStore.serverErrors.length === 0}
				<p class="empty-hint">
					{mcpStore.enabledServers.length === 0
						? t('settings.mcp.noServers')
						: t('settings.mcp.noTools')}
				</p>
			{/if}

			{#if mcpStore.tools.length > 0}
				<ul class="tool-list">
					{#each mcpStore.tools as tool (tool.serverId + '/' + tool.name)}
						<li class="tool-card">
							<div class="tool-header">
								<span class="tool-name">{tool.name}</span>
								<span class="tool-server">{tool.serverName}</span>
							</div>
							{#if tool.description}
								<p class="tool-desc">{tool.description}</p>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</SettingsSection>
	{/if}
</div>

<style>
	.section {
		margin-bottom: 1rem;
	}

	.notice {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.notice strong {
		font-size: 0.9375rem;
		color: var(--text-primary);
	}

	.notice span {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.form-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 1rem;
		margin-bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}

	.form-title { font-size: 14px; font-weight: 500; color: var(--text-primary); }

	.form-row {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.75rem;
	}

	.form-label { font-size: 14px; font-weight: 500; color: var(--text-primary); min-width: 80px; }

	.form-textarea {
		resize: vertical;
		font-family: monospace;
		line-height: 1.4;
	}

	.form-hint { font-size: 13px; font-weight: 400; line-height: 1.45; color: var(--text-secondary); }

	.transport-toggle { display: flex; flex-wrap: wrap; gap: 16px; }

	.transport-opt { display: inline-flex; align-items: center; gap: 8px; min-height: 32px; font-size: 14px; color: var(--text-primary); cursor: pointer; }

	.checkbox-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-primary);
		flex-wrap: wrap;
	}

	.form-error {
		font-size: 0.8rem;
		color: var(--color-error);
		margin: 0;
	}

	.form-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.server-list,
	.tool-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.server-card {
		flex-wrap: wrap;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
	}

	.server-info {
		flex: 1 1 12rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.server-name {
		font-weight: 600;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.server-meta {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.server-actions {
		flex-wrap: wrap;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.tool-card {
		background: var(--bg-secondary);
		border: 1px solid var(--border-light);
		border-radius: var(--radius-md);
		padding: 0.65rem 0.9rem;
	}

	.tool-header {
		flex-wrap: wrap;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.tool-name {
		overflow-wrap: anywhere;
		font-weight: 600;
		font-size: 0.88rem;
		color: var(--text-primary);
	}

	.tool-server {
		font-size: 0.72rem;
		color: var(--text-tertiary);
		flex-shrink: 0;
	}

	.tool-desc {
		overflow-wrap: anywhere;
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		color: var(--text-secondary);
		line-height: 1.4;
	}

	.empty-hint {
		font-size: 0.85rem;
		color: var(--text-tertiary);
		text-align: center;
		padding: 1.5rem 0;
	}
	@media (max-width: 640px) {
		.form-row {
			flex-direction: column;
			align-items: stretch;
			gap: 0.5rem;
		}
	}
</style>
