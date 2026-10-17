<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { isTauri } from '$lib/services/platform';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import Switch from '../ui/Switch.svelte';
	import Select from '../ui/Select.svelte';
	import {
		openNotificationSettings,
		queryNotificationPermission,
		requestNotificationPermission
	} from '$lib/services/modules/messaging/proactive-bridge';

	const enabled = $derived(modulesStore.isModuleEnabled('proactive'));
	const settings = $derived(modulesStore.getModuleSettings('proactive'));
	const paused = $derived(!!settings.paused);

	const maxOptions = $derived([1, 2, 3].map((n) => ({ value: String(n), label: String(n) })));
	const quietOptionValue = $derived(settings.quietEnabled ? settings.quietHours : 'off');
	const quietOptions = $derived([
		{ value: '22-8', label: '22:00 – 08:00' },
		{ value: '23-9', label: '23:00 – 09:00' },
		{ value: '0-7', label: '00:00 – 07:00' },
		{ value: 'off', label: t('proactive.quietOff') }
	]);

	let permissionAllowed = $state<boolean | null>(null);

	async function toggleEnabled(next: boolean) {
		await modulesStore.setModuleEnabled('proactive', next);
		if (next) {
			await requestNotificationPermission();
			await refreshPermission();
		}
	}

	async function refreshPermission() {
		const state = await queryNotificationPermission();
		// The plugin's desktop state serializes with quotes for the JS bridge.
		permissionAllowed = state === 'granted' || state === '"granted"';
	}

	onMount(() => {
		if (isTauri()) void refreshPermission();
	});
</script>

{#if !isTauri()}
	<SettingsSection title={t('settings.nav.proactive')}>
		<p>{t('proactive.webOnlyNote')}</p>
	</SettingsSection>
{:else}
	<SettingsSection
		title={t('settings.nav.proactive')}
		description={t('proactive.pageSubtitle')}
	>
		<div class="ai-fields">
			<div class="proactive-row">
				<div>
					<label class="settings-label" for="proactive-enabled">{t('proactive.enable')}</label>
					{#if paused}<p class="hint">{t('proactive.pausedNote')}</p>{/if}
				</div>
				<Switch
					id="proactive-enabled"
					checked={enabled}
					label={t('settings.nav.proactive')}
					onchange={(next) => void toggleEnabled(next)}
				/>
			</div>

			{#if enabled}
				<div class="ai-field">
					<label class="settings-label" for="proactive-max">{t('proactive.maxPerDay')}</label>
					<Select
						id="proactive-max"
						label={t('proactive.maxPerDayHint')}
						value={String(settings.maxPerDay)}
						options={maxOptions}
						onchange={(next) => void modulesStore.setModuleSetting('proactive', 'maxPerDay', Number(next))}
					/>
					<p class="hint">{t('proactive.maxPerDayHint')}</p>
				</div>

				<div class="ai-field">
					<label class="settings-label" for="proactive-quiet">{t('proactive.quietHours')}</label>
					<Select
						id="proactive-quiet"
						label={t('proactive.quietHours')}
						value={quietOptionValue}
						options={quietOptions}
						onchange={(next) => {
							if (next === 'off') {
								void modulesStore.setModuleSetting('proactive', 'quietEnabled', false);
								return;
							}
							void modulesStore.setModuleSetting('proactive', 'quietHours', next);
							void modulesStore.setModuleSetting('proactive', 'quietEnabled', true);
						}}
					/>
					<p class="hint">{t('proactive.quietHoursHint')}</p>
				</div>

				<div class="proactive-row">
					<label class="settings-label" for="proactive-pause">{t('proactive.pause')}</label>
					<Switch
						id="proactive-pause"
						checked={paused}
						label={t('proactive.pause')}
						onchange={(next) => void modulesStore.setModuleSetting('proactive', 'paused', next)}
					/>
				</div>

				<div class="proactive-row">
					<div>
						<span class="settings-label">{t('proactive.notifications')}</span>
						<p class="hint">
							{permissionAllowed === true ? t('proactive.permissionAllowed') : t('proactive.permissionPrompt')}
							{t('proactive.permissionGuide')}
						</p>
					</div>
					{#if permissionAllowed !== true}
						<button class="proactive-settings-button" type="button" onclick={() => void openNotificationSettings()}>
							{t('proactive.openSystemSettings')}
						</button>
					{/if}
				</div>
			{/if}
		</div>
	</SettingsSection>
{/if}

<style>
	.proactive-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		min-width: 0;
	}
	.proactive-row > div { min-width: 0; }
	.proactive-settings-button {
		flex-shrink: 0;
		padding: 8px 14px;
		border-radius: var(--control-radius);
		border: 1px solid var(--border-subtle);
		background: var(--control-bg);
		color: var(--text-primary);
		font: inherit;
		font-size: 13px;
		cursor: pointer;
	}
	.proactive-settings-button:hover { background: var(--t3-sidebar-row-hover); }
</style>