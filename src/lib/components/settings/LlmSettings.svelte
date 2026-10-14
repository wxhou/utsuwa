<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Switch from '$lib/components/ui/Switch.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getLLMProvider } from '$lib/services/providers/registry';
	import type { VisionSource } from '$lib/services/providers/vision';
	import { Icon, ProviderDropdown, ModelDropdown, ContextSizeSlider } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import { DOCS_URL } from '$lib/config/site';
	import { isTauri } from '$lib/services/platform';
	import type { LlmSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import SettingsSection from './SettingsSection.svelte';

	let { state }: { state: LlmSettingsState } = $props();

	// The same fields serve the chat model and the separate vision model
	const vision = $derived(state.moduleId === 'vision');
	const idp = $derived(vision ? 'vision' : 'llm');
	const title = $derived(vision ? t('settings.llm.vision') : t('settings.llm.chatLlm'));
	const switchLabel = $derived(vision ? t('settings.llm.visionSwitch') : t('settings.llm.chatLlm'));

	const LOCAL_LLM_DOCS_URL = `${DOCS_URL}/guides/local-llm-setup#allowing-utsuwa-to-reach-ollama`;

	function openLocalLlmDocs(e: MouseEvent) {
		if (isTauri()) {
			e.preventDefault();
			import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(LOCAL_LLM_DOCS_URL));
		}
	}

	function handleContextSizeChange(value: number | undefined) {
		state.handleLLMNumberSetting('contextSize', value);
	}

	function visionNote(capable: boolean, source: VisionSource, providerName = 'the provider') {
		if (source === 'you') return t('settings.llm.visionSetByYou');
		if (source === 'provider') return t('settings.llm.visionReportedBy', { name: providerName });
		return capable
			? t('settings.llm.visionGuessOff')
			: t('settings.llm.visionGuessOn');
	}
</script>

{#snippet troubleHelp()}
	<p class="hint">
		{t('settings.llm.troublePrefix')} <a
			href={LOCAL_LLM_DOCS_URL}
			target="_blank"
			rel="noopener"
			onclick={openLocalLlmDocs}>{t('settings.llm.troubleLink')}</a
		>
	</p>
{/snippet}

<SettingsSection
	{title}
	description={vision ? t('settings.llm.visionDesc') : undefined}
>
	{#snippet actions()}<Switch checked={state.isLLMEnabled} onchange={state.toggleLLM} label={switchLabel} />{/snippet}
	<div class="ai-fields">
		{#if state.isLLMEnabled}
			<div class="ai-field">
				<span class="settings-label">{t('settings.fields.provider')}</span>
				<ProviderDropdown
					type="llm"
					value={state.activeProvider}
					onSelect={state.handleLLMProviderChange}
					placeholder={vision ? t('settings.llm.selectVisionProvider') : t('settings.llm.selectLlmProvider')}
				/>
			</div>

			{#if state.activeProvider}
				{@const provider = getLLMProvider(state.activeProvider)}

				{#if provider?.requiresApiKey || provider?.custom}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-api-key">{provider?.custom ? t('settings.fields.apiKeyOptional') : t('settings.fields.apiKey')}</label>
						<input
							id="{idp}-api-key"
							type="password"
							class="settings-field"
							class:error={state.llmFetchError}
							placeholder={provider?.custom ? t('settings.fields.apiKeyOptionalPh') : t('settings.fields.apiKeyPh')} aria-label={provider?.custom ? t('settings.fields.apiKeyOptionalPh') : t('settings.fields.apiKeyPh')}
							value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
							oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
							onblur={provider?.custom ? undefined : state.handleLLMApiKeyBlur}
						/>
					</div>
				{/if}

				{#if provider?.isLocal || provider?.custom}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-base-url">{t('settings.fields.baseUrl')}</label>
						<input
							id="{idp}-base-url"
							type="text"
							class="settings-field"
							placeholder={provider.custom
								? t('settings.llm.baseUrlPhCustom')
								: provider.defaultBaseUrl || 'http://localhost:11434/v1/'}
							value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
							oninput={(e) => state.handleLLMBaseUrlChange(provider.id, e.currentTarget.value)}
							onblur={provider.custom ? undefined : () => state.debouncedFetchLLMModels()}
						/>
						{#if state.llmFetchError}
							<p class="hint error">
								<Icon name="alert-circle" size={14} />
								{state.llmFetchError}
							</p>
							{@render troubleHelp()}
						{/if}
						{#if provider?.isLocal && !state.llmFetchError}
							{@render troubleHelp()}
						{/if}
					</div>
				{/if}

				{#if provider?.custom}
					{@const customConfig = settingsStore.getProviderConfig(provider.id)}
					<div class="ai-field">
						<label class="settings-label" for="{idp}-custom-model">{t('settings.fields.model')}</label>
						<input
							id="{idp}-custom-model"
							type="text"
							class="settings-field"
							placeholder={t('settings.fields.modelPhExample')} aria-label={t('settings.fields.modelPhExample')}
							value={state.activeModel ?? ''}
							oninput={(e) => state.handleLLMModelChange(e.currentTarget.value.trim())}
						/>
						{#if customConfig.baseUrl}
							<ModelDropdown
								models={state.llmModels}
								value={state.activeModel}
								onSelect={state.handleLLMModelChange}
								placeholder={t('settings.llm.pickFetched')}
								isLoading={state.llmIsLoading}
								onRefresh={state.refreshLLMModels}
								disabled={false}
							/>
						{:else}
							<p class="hint">{t('settings.llm.enterBaseUrlFirst')}</p>
						{/if}
					</div>

					{#if !vision}
					<details class="llm-advanced-params">
						<summary>{t('settings.llm.advanced')}</summary>
						<div class="llm-param-grid">
							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-temperature">
									{t('settings.llm.temperature')}
									<span class="llm-param-value">{state.consciousnessSettings.temperature.toFixed(2)}</span>
								</label>
								<input
									id="llm-temperature"
									type="range" use:rangeProgress={state.consciousnessSettings.temperature}
									class="settings-range"
									min="0"
									max="2"
									step="0.05"
									value={state.consciousnessSettings.temperature}
									oninput={(e) => state.handleLLMNumberSetting('temperature', Number(e.currentTarget.value))}
								/>
								<p class="hint">{t('settings.llm.temperatureHint')}</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-top-p">
									{t('settings.llm.topP')}
									<span class="llm-param-value">{state.consciousnessSettings.topP.toFixed(2)}</span>
								</label>
								<input
									id="llm-top-p"
									type="range" use:rangeProgress={state.consciousnessSettings.topP}
									class="settings-range"
									min="0"
									max="1"
									step="0.05"
									value={state.consciousnessSettings.topP}
									oninput={(e) => state.handleLLMNumberSetting('topP', Number(e.currentTarget.value))}
								/>
								<p class="hint">{t('settings.llm.topPHint')}</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-max-tokens">
									{t('settings.llm.maxTokens')}
									<span class="llm-param-value">{state.consciousnessSettings.maxTokens ?? t('settings.llm.default')}</span>
								</label>
								<input
									id="llm-max-tokens"
									type="number"
									class="settings-field"
									min="1"
									step="1"
									placeholder={t('settings.llm.unlimited')} aria-label={t('settings.llm.unlimited')}
									value={state.consciousnessSettings.maxTokens ?? ''}
									oninput={(e) => {
										const val = e.currentTarget.value;
										state.handleLLMNumberSetting('maxTokens', val ? parseInt(val, 10) : undefined);
									}}
								/>
								<p class="hint">{t('settings.llm.maxTokensHint')}</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-presence-penalty">
									{t('settings.llm.presencePenalty')}
									<span class="llm-param-value">{state.consciousnessSettings.presencePenalty.toFixed(1)}</span>
								</label>
								<input
									id="llm-presence-penalty"
									type="range" use:rangeProgress={state.consciousnessSettings.presencePenalty}
									class="settings-range"
									min="-2"
									max="2"
									step="0.1"
									value={state.consciousnessSettings.presencePenalty}
									oninput={(e) => state.handleLLMNumberSetting('presencePenalty', Number(e.currentTarget.value))}
								/>
								<p class="hint">{t('settings.llm.presenceHint')}</p>
							</div>

							<div class="llm-param-row">
								<label class="llm-param-label" for="llm-frequency-penalty">
									{t('settings.llm.frequencyPenalty')}
									<span class="llm-param-value">{state.consciousnessSettings.frequencyPenalty.toFixed(1)}</span>
								</label>
								<input
									id="llm-frequency-penalty"
									type="range" use:rangeProgress={state.consciousnessSettings.frequencyPenalty}
									class="settings-range"
									min="-2"
									max="2"
									step="0.1"
									value={state.consciousnessSettings.frequencyPenalty}
									oninput={(e) => state.handleLLMNumberSetting('frequencyPenalty', Number(e.currentTarget.value))}
								/>
								<p class="hint">{t('settings.llm.frequencyHint')}</p>
							</div>
						</div>
					</details>
					{/if}
				{:else}
					<div class="ai-field">
						<span class="settings-label">{t('settings.fields.model')}</span>
						<ModelDropdown
							models={state.llmModels}
							value={state.activeModel}
							onSelect={state.handleLLMModelChange}
							placeholder={t('settings.fields.selectModel')}
							isLoading={state.llmIsLoading}
							onRefresh={state.llmHasApiKey ? state.refreshLLMModels : undefined}
							disabled={!state.llmHasApiKey}
							disabledMessage={t('settings.fields.enterKeyFirst')}
						/>
					</div>
				{/if}

				{#if state.activeModel}
					{@const model = state.activeModel}
					{@const sight = settingsStore.resolveModelVision(state.activeProvider, model)}
					<div class="setting-row">
						<div class="setting-info">
							<span class="setting-label">{t('settings.llm.canSeeImages')}</span>
							<span class="setting-desc">{visionNote(sight.capable, sight.source, provider?.name)}</span>
						</div>
						<Switch
							id="{idp}-sees-images"
							label={t('settings.llm.seesImagesSwitch')}
							checked={sight.capable}
							onchange={(on) => settingsStore.setVisionOverride(state.activeProvider, model, on)}
						/>
					</div>
				{/if}

				{#if !vision}
					<ContextSizeSlider
						contextSize={state.consciousnessSettings.contextSize}
						onChange={handleContextSizeChange}
						id="llm-context-size-toggle"
						note={t('settings.llm.contextScalingHint')}
					/>
				{/if}
			{/if}
		{:else}
			<p class="hint">
				{vision
					? t('settings.llm.visionOffHint')
					: t('settings.llm.chatOffHint')}
			</p>
		{/if}
	</div>
</SettingsSection>

<style>
	.hint.error {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.hint.error {
		color: var(--color-error);
	}

	.hint :global(svg) {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.hint a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 2px;
	}

	.hint a:hover {
		color: var(--text-primary);
	}

	.llm-advanced-params {
		border-radius: var(--radius-lg);
		padding: 12px 16px;
		background: var(--bg-secondary);
	}

	.llm-advanced-params summary {
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
		cursor: pointer;
		user-select: none;
	}

	.llm-param-grid {
		margin-top: 12px;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 16px;
	}

	.llm-param-row {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.llm-param-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-primary);
	}

	.llm-param-value {
		font-size: 13px;
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 640px) {
		.llm-advanced-params {
			padding: 12px;
		}
	}
</style>
