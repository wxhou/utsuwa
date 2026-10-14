<script lang="ts">
	import { onMount } from 'svelte';
	import { getColorMode, setColorMode, type ColorMode } from '$lib/utils/color-mode';
	import { t } from '$lib/i18n';
	let colorMode = $state<ColorMode>('system');
	const colorModes = $derived([
		{ value: 'system' as ColorMode, label: t('settings.display.theme.system'), icon: 'monitor' },
		{ value: 'light' as ColorMode, label: t('settings.display.theme.light'), icon: 'sun' },
		{ value: 'dark' as ColorMode, label: t('settings.display.theme.dark'), icon: 'moon' }
	]);
	onMount(() => { colorMode = getColorMode(); });

	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import { Button } from '$lib/components/ui';
	import { wakeLockStore } from '$lib/stores/wake-lock.svelte';
	import {
		displayStore,
		type ChatDisplayMode,
		type SidebarPosition,
		type ChatBarAlignment,
		type TextRevealSpeed
	} from '$lib/stores/display.svelte';

	// Stored values keep their original names; only the labels changed
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

	const wakeStatus = $derived.by(() => {
		switch (wakeLockStore.status) {
			case 'unsupported': return t('settings.display.wakeLockUnsupported');
			case 'active': return t('settings.display.wakeLockActive');
			case 'requesting': return t('settings.display.wakeLockRequesting');
			default: return displayStore.keepScreenAwake
				? t('settings.display.wakeLockInactive')
				: t('settings.display.wakeLockOff');
		}
	});

	const sidebarActive = $derived(displayStore.chatDisplayMode === 'sidebar');

	function stepDelay(delta: number) {
		const current = displayStore.typingIndicatorDelayMs / 1000;
		const next = Math.round((current + delta) * 10) / 10;
		displayStore.setTypingIndicatorDelayMs(next * 1000);
	}
</script>

<div class="display-page">
	<header class="page-header"><h2>{t('settings.display.title')}</h2><p>{t('settings.display.subtitle')}</p></header>
	<SettingsSection title={t('settings.display.appearance')}>
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">{t('settings.display.colorTheme')}</span><span class="setting-desc">{t('settings.display.colorThemeDesc')}</span></div>
			<SegmentedControl label={t('settings.display.colorTheme')} options={colorModes} value={colorMode} onchange={(value) => { colorMode = value; setColorMode(value); }} compact />
		</div>
	</SettingsSection>
	<SettingsSection title={t('settings.display.chatDisplay')}>
		{#snippet actions()}<Button variant="ghost" size="sm" onclick={() => displayStore.resetChatDisplay()}>{t('settings.display.resetToDefaults')}</Button>{/snippet}
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">{t('settings.display.conversationLayout')}</span><span class="setting-desc">{t('settings.display.conversationLayoutDesc')}</span></div>
			<SegmentedControl label={t('settings.display.chatDisplayMode')} options={modes} value={displayStore.chatDisplayMode} onchange={displayStore.setChatDisplayMode} compact />
		</div>
		{#if sidebarActive}
			<div class="setting-row">
				<div class="setting-info"><span class="setting-label">{t('settings.display.dockSideLabel')}</span><span class="setting-desc">{t('settings.display.dockSideDesc')}</span></div>
				<SegmentedControl label={t('settings.display.dockSide')} options={positions} value={displayStore.sidebarPosition} onchange={displayStore.setSidebarPosition} compact />
			</div>
		{:else}
			<div class="setting-row">
				<div class="setting-info"><span class="setting-label">{t('settings.display.inputBarAlignmentLabel')}</span><span class="setting-desc">{t('settings.display.inputBarHint')}</span></div>
				<SegmentedControl label={t('settings.display.inputBarAlignment')} options={alignments} value={displayStore.chatBarAlignment} onchange={displayStore.setChatBarAlignment} compact />
			</div>
		{/if}
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">{t('settings.display.textReveal')}</span><span class="setting-desc">{t('settings.display.textRevealHint')}</span></div>
			<SegmentedControl label={t('settings.display.textRevealSpeed')} options={revealSpeeds} value={displayStore.textRevealSpeed} onchange={displayStore.setTextRevealSpeed} compact />
		</div>
	</SettingsSection>
	<SettingsSection title={t('settings.display.typingIndicator')}>
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">{t('settings.display.waitTone')}</span><span class="setting-desc">{t('settings.display.waitToneDesc')}</span></div>
			<Switch label={t('settings.display.waitTone')} checked={displayStore.waitToneEnabled} onchange={displayStore.setWaitToneEnabled} />
		</div>
		<div class="setting-row">
			<div class="setting-info"><span class="setting-label">{t('settings.display.delay')}</span><span class="setting-desc">{t('settings.display.delayDesc')}</span></div>
			<div class="delay-input-container">
				<button class="btn btn-secondary btn-icon" aria-label={t('settings.display.delayDecrease')} onclick={() => stepDelay(-0.1)} disabled={displayStore.typingIndicatorDelayMs <= 0}>−</button>
				<input type="number" class="delay-input settings-field" aria-label={t('settings.display.delaySeconds')} min="0" max="10" step="0.1" value={(displayStore.typingIndicatorDelayMs / 1000).toFixed(1)} oninput={(e) => { const v = parseFloat(e.currentTarget.value); if (!Number.isNaN(v)) displayStore.setTypingIndicatorDelayMs(v * 1000); }} />
				<span class="delay-unit">s</span>
				<button class="btn btn-secondary btn-icon" aria-label={t('settings.display.delayIncrease')} onclick={() => stepDelay(0.1)} disabled={displayStore.typingIndicatorDelayMs >= 10000}>+</button>
			</div>
		</div>
	</SettingsSection>
	<SettingsSection title={t('settings.display.behavior')}>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">{t('settings.display.keepScreenAwake')}</span>
				<span class="setting-desc">{t('settings.display.keepScreenAwakeDesc')}</span>
				<span class="setting-desc" role="status">{wakeStatus}</span>
			</div>
			<Switch label={t('settings.display.keepScreenAwake')} checked={displayStore.keepScreenAwake} onchange={displayStore.setKeepScreenAwake} disabled={wakeLockStore.status === 'unsupported' && !displayStore.keepScreenAwake} />
		</div>
		{#if displayStore.keepScreenAwake && wakeLockStore.status === 'inactive'}<Button variant="secondary" size="sm" onclick={() => wakeLockStore.retry()}>{t('settings.display.wakeLockRetry')}</Button>{/if}
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">{t('settings.display.moodExpressions')}</span>
				<span class="setting-desc">{t('settings.display.moodExpressionsDesc')}</span>
			</div>
			<Switch label={t('settings.display.moodExpressions')} checked={displayStore.moodExpressions} onchange={displayStore.setMoodExpressions} />
		</div>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">{t('settings.display.personalizedMoments')}</span>
				<span class="setting-desc">{t('settings.display.personalizedMomentsDesc')}</span>
			</div>
			<Switch label={t('settings.display.personalizedMoments')} checked={displayStore.generatedMoments} onchange={displayStore.setGeneratedMoments} />
		</div>
	</SettingsSection>
</div>

<style>
	.delay-input-container {
		display: flex;
		align-items: center;
		gap: 0.4rem;
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
</style>
