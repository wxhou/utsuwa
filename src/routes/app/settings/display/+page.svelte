<script lang="ts">
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import { Button } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import { wakeLockStore } from '$lib/stores/wake-lock.svelte';
	import { LOCALES, currentLocale, setLocale, type Locale } from '$lib/i18n';
	import {
		displayStore,
		type ChatDisplayMode,
		type SidebarPosition,
		type ChatBarAlignment,
		type TextRevealSpeed
	} from '$lib/stores/display.svelte';

	// Stored values keep their original names; only the labels changed.
	// $derived so the labels follow locale switches.
	const modes = $derived([
		{ value: 'bubble' as ChatDisplayMode, label: t('settings.display.immersive') },
		{ value: 'sidebar' as ChatDisplayMode, label: t('settings.display.chatWindow') }
	]);

	const positions = $derived([
		{ value: 'left' as SidebarPosition, label: t('common.left') },
		{ value: 'right' as SidebarPosition, label: t('common.right') }
	]);

	const alignments = $derived([
		{ value: 'left' as ChatBarAlignment, label: t('common.left') },
		{ value: 'center' as ChatBarAlignment, label: t('common.center') },
		{ value: 'right' as ChatBarAlignment, label: t('common.right') }
	]);

	const revealSpeeds = $derived([
		{ value: 'off' as TextRevealSpeed, label: t('common.off') },
		{ value: 'slow' as TextRevealSpeed, label: t('common.slow') },
		{ value: 'normal' as TextRevealSpeed, label: t('common.normal') },
		{ value: 'fast' as TextRevealSpeed, label: t('common.fast') }
	]);

	const sidebarActive = $derived(displayStore.chatDisplayMode === 'sidebar');

	const localeOptions = LOCALES.map((loc) => ({
		value: loc,
		label: loc === 'en' ? 'English' : '简体中文'
	}));


	function stepDelay(delta: number) {
		const current = displayStore.typingIndicatorDelayMs / 1000;
		const next = Math.round((current + delta) * 10) / 10;
		displayStore.setTypingIndicatorDelayMs(next * 1000);
	}
</script>

<div class="display-page">
	<header class="page-header">
		<h2>{t('settings.display.pageTitle')}</h2>
		<p>{t('settings.display.pageSubtitle')}</p>
	</header>

	<SettingsSection title={t('settings.display.language')} description={t('settings.display.languageHint')}>
		<SegmentedControl
			label={t('settings.display.languageHint')}
			options={localeOptions}
			value={currentLocale()}
			onchange={(next: string) => setLocale(next as Locale)}
		/>
	</SettingsSection>

	<SettingsSection
		title={t('settings.display.keepScreenAwake')}
		description={t('settings.display.keepScreenAwakeDesc')}
	>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">{t('settings.display.keepScreenAwake')}</span>
				<span class="setting-desc" role="status">
					{#if wakeLockStore.status === 'unsupported'}{t('settings.display.wakeLockUnsupported')}
					{:else if wakeLockStore.status === 'active'}{t('settings.display.wakeLockActive')}
					{:else if wakeLockStore.status === 'requesting'}{t('settings.display.wakeLockRequesting')}
					{:else if displayStore.keepScreenAwake}{t('settings.display.wakeLockInactive')}
					{:else}{t('settings.display.wakeLockOff')}{/if}
				</span>
			</div>
			<Switch
				label={t('settings.display.keepScreenAwake')}
				checked={displayStore.keepScreenAwake}
				onchange={displayStore.setKeepScreenAwake}
				disabled={wakeLockStore.status === 'unsupported' && !displayStore.keepScreenAwake}
			/>
		</div>
		{#if displayStore.keepScreenAwake && wakeLockStore.status === 'inactive'}<Button
				variant="secondary"
				size="sm"
				onclick={() => wakeLockStore.retry()}>{t('settings.display.wakeLockRetry')}</Button
			>{/if}
	</SettingsSection>

	<SettingsSection title={t('settings.display.chatDisplay')}>
		{#snippet actions()}<Button
				variant="secondary"
				size="sm"
				onclick={() => displayStore.resetChatDisplay()}
			>
				{t('settings.display.resetToDefaults')}
			</Button>{/snippet}

		<SegmentedControl
			label={t('settings.display.chatDisplayMode')}
			options={modes}
			value={displayStore.chatDisplayMode}
			onchange={displayStore.setChatDisplayMode}
		/>
		<p class="hint">{t('settings.display.chatDisplayHint')}</p>
	</SettingsSection>

	{#if sidebarActive}
		<SettingsSection title={t('settings.display.chatWindow')}>
			<div class="settings-stack">
				<div class="setting-row">
					<div class="setting-info">
						<span class="setting-label">{t('settings.display.dockSide')}</span>
						<span class="setting-desc">{t('settings.display.dockSideDesc')}</span>
					</div>
					<SegmentedControl
						label={t('settings.display.dockSide')}
						options={positions}
						value={displayStore.sidebarPosition}
						onchange={displayStore.setSidebarPosition}
						compact
					/>
				</div>
			</div>
		</SettingsSection>
	{/if}

	{#if !sidebarActive}
		<SettingsSection title={t('settings.display.inputBar')}>
			<SegmentedControl
				label={t('settings.display.inputBarAlignment')}
				options={alignments}
				value={displayStore.chatBarAlignment}
				onchange={displayStore.setChatBarAlignment}
			/>
			<p class="hint">{t('settings.display.inputBarHint')}</p>
		</SettingsSection>
	{/if}
	<SettingsSection title={t('settings.display.textReveal')}>
		<SegmentedControl
			label={t('settings.display.textRevealSpeed')}
			options={revealSpeeds}
			value={displayStore.textRevealSpeed}
			onchange={displayStore.setTextRevealSpeed}
		/>
		<p class="hint">{t('settings.display.textRevealHint')}</p>
	</SettingsSection>

	<SettingsSection title={t('settings.display.typingIndicator')}>
		<div class="settings-stack">
			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">{t('settings.display.waitTone')}</span>
					<span class="setting-desc">{t('settings.display.waitToneDesc')}</span>
				</div>
				<Switch
					label={t('settings.display.waitTone')}
					checked={displayStore.waitToneEnabled}
					onchange={displayStore.setWaitToneEnabled}
				/>
			</div>

			<div class="setting-row">
				<div class="setting-info">
					<span class="setting-label">{t('settings.display.delay')}</span>
					<span class="setting-desc">{t('settings.display.delayDesc')}</span>
				</div>
				<div class="delay-input-container">
					<button
						class="delay-step"
						aria-label={t('settings.display.delayDecrease')}
						onclick={() => stepDelay(-0.1)}
						disabled={displayStore.typingIndicatorDelayMs <= 0}>−</button
					>
					<input
						type="number"
						class="delay-input settings-field"
						aria-label={t('settings.display.delaySeconds')}
						min="0"
						max="10"
						step="0.1"
						value={(displayStore.typingIndicatorDelayMs / 1000).toFixed(1)}
						oninput={(e) => {
							const v = parseFloat(e.currentTarget.value);
							if (!Number.isNaN(v)) displayStore.setTypingIndicatorDelayMs(v * 1000);
						}}
					/>
					<span class="delay-unit">s</span>
					<button
						class="delay-step"
						aria-label={t('settings.display.delayIncrease')}
						onclick={() => stepDelay(0.1)}
						disabled={displayStore.typingIndicatorDelayMs >= 10000}>+</button
					>
				</div>
			</div>
		</div>
	</SettingsSection>
</div>

<style>
	.display-page {
		height: 100%;
		max-width: 720px;
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
	}

	.page-header {
		flex-shrink: 0;
	}

	.page-header h2 {
		margin: 0 0 0.25rem;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.page-header p {
		margin: 0;
		color: var(--text-secondary);
		font-size: 0.875rem;
	}

	.settings-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.hint {
		margin: 0.625rem 0 0;
		color: var(--text-secondary);
		font-size: 0.8125rem;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.setting-label {
		font-weight: 600;
		font-size: 0.875rem;
		color: var(--text-primary);
	}

	.setting-desc {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	.delay-input-container {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.delay-step {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-md);
		border: none;
		background: var(--bg-secondary);
		color: var(--text-primary);
		font-size: 1rem;
		line-height: 1;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.delay-step:hover:not(:disabled) {
		background: var(--bg-tertiary);
	}

	.delay-step:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.delay-input {
		width: 3.5rem;
		padding: 0.35rem 0.5rem;

		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.delay-input::-webkit-outer-spin-button,
	.delay-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
	}

	.delay-unit {
		font-size: 0.8rem;
		color: var(--text-secondary);
	}

	@media (max-width: 640px) {
		.setting-row {
			flex-wrap: wrap;
		}
	}
</style>
