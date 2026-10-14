<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { goto } from '$app/navigation';
	import { page as routePage } from '$app/state';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { characterStore } from '$lib/stores/character.svelte';
	import { getCompletedEvents } from '$lib/services/storage/events';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createPersonaPageState } from './persona-page.svelte';
	import AvatarGallery from './AvatarGallery.svelte';
	import StatsPanel from './StatsPanel.svelte';
	import { t } from '$lib/i18n';

	const page = createPersonaPageState();
	const view = $derived(routePage.url.searchParams.get('view') === 'state' ? 'state' : 'profile');
	function navigate(next: string) {
		const url = new URL(routePage.url);
		url.searchParams.set('view', next);
		void goto(url, { noScroll: true, keepFocus: true });
	}
	$effect(() => {
		if (page.isDatingSimMode) getCompletedEvents().then(records => { page.completedEventRecords = records; });
	});
	$effect(() => {
		if (characterStore.isReady) { page.formName = personaStore.name; page.formSystemPrompt = personaStore.systemPrompt; page.formCustomSystemPrompt = personaStore.activeCard.customSystemPrompt ?? ''; }
	});
	let customPromptField = $state<HTMLTextAreaElement>();
	function startFromDefault() {
		page.formCustomSystemPrompt = page.defaultRules;
		customPromptField?.focus();
	}
</script>

<div class="page character-screen">
	<header class="page-header"><h2>{t('settings.persona.title')}</h2><p>{t('settings.persona.subtitle')}</p></header>
	<Tabs bind:value={() => view, navigate} items={[{ value: 'profile', label: t('settings.persona.tabProfile') }, { value: 'state', label: t('settings.persona.tabState') }]} label={t('settings.persona.viewsAria')}>
		{#snippet children(tab)}
			{#if tab === 'profile'}
				<div class="profile-sections">
					<SettingsSection title={t('settings.persona.identity')}>
						<div class="setting-row"><div class="setting-info"><label class="setting-label" for="character-name">{t('settings.persona.nameLabel')}</label><span class="setting-desc">{t('settings.persona.nameDesc')}</span></div>
							<input id="character-name" class="settings-field name-field" bind:value={page.formName} placeholder="Utsuwa" aria-label={t('settings.persona.nameLabel')} onblur={page.saveName} />
						</div>
					</SettingsSection>
					<SettingsSection title={t('settings.persona.appearance')}><AvatarGallery {page} /></SettingsSection>
					<SettingsSection title={t('settings.persona.personality')} description={t('settings.persona.personalityDesc')}>
						<label class="sr-only" for="character-personality">{t('onboarding.corePersonality')}</label>
						<textarea id="character-personality" class="settings-field" bind:value={page.formSystemPrompt} rows="6" onblur={page.saveSystemPrompt} placeholder={t('settings.persona.personalityPlaceholder')}></textarea>
					</SettingsSection>
					<SettingsSection title={t('settings.persona.systemPrompt')} description={t('settings.persona.systemPromptDesc')}>
						{#snippet actions()}
							{#if page.formCustomSystemPrompt.trim()}<Button variant="ghost" size="sm" onclick={() => (page.resetPromptOpen = true)}>{t('settings.persona.resetPrompt')}</Button>
							{:else}<Button variant="ghost" size="sm" onclick={startFromDefault}>{t('settings.persona.startFromDefault')}</Button>{/if}
						{/snippet}
						<div class="ai-fields">
							<label class="sr-only" for="character-system-prompt">{t('settings.persona.systemPrompt')}</label>
							<textarea id="character-system-prompt" class="settings-field" bind:this={customPromptField} bind:value={page.formCustomSystemPrompt} rows="8" onblur={page.saveCustomSystemPrompt} placeholder={page.defaultRules} aria-describedby="character-system-prompt-hint"></textarea>
							<p class="hint" id="character-system-prompt-hint">{t('settings.persona.systemPromptHint', { charToken: '{{char}}', userToken: '{{user}}' })}</p>
						</div>
					</SettingsSection>
					<SettingsSection title={t('settings.persona.experience')}>
						<div class="setting-row"><div class="setting-info"><span class="setting-label">{t('settings.persona.companionMode')}</span><span class="setting-desc">{t('settings.persona.companionModeDesc')}</span></div>
							<SegmentedControl label={t('settings.persona.appMode')} value={page.appMode} onchange={page.requestModeChange} options={[{ value: 'companion', label: t('onboarding.companion'), icon: 'sparkles' }, { value: 'dating_sim', label: t('onboarding.datingSim'), icon: 'heart' }]} compact />
						</div>
					</SettingsSection>
				</div>
			{:else}<StatsPanel {page} />{/if}
		{/snippet}
	</Tabs>
</div>

<Dialog.Root open={page.modeConfirmOpen} onOpenChange={(open) => { if (!open) page.cancelModeChange(); }}>
	<Dialog.Portal>
		<Dialog.Overlay class="confirm-modal" />
		<Dialog.Content class="confirm-content">
			<Dialog.Title class="confirm-title">{t('settings.persona.changeModeTitle')}</Dialog.Title>
			<Dialog.Description class="confirm-message">{t('settings.persona.changeModeBody')}</Dialog.Description>
			<div class="confirm-actions"><Dialog.Close class="btn btn-secondary">{t('common.cancel')}</Dialog.Close><button class="btn btn-primary" onclick={page.confirmModeChange}>{t('settings.persona.changeModeConfirm')}</button></div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Dialog.Root open={page.resetPromptOpen} onOpenChange={(open) => (page.resetPromptOpen = open)}>
	<Dialog.Portal>
		<Dialog.Overlay class="confirm-modal" />
		<Dialog.Content class="confirm-content">
			<Dialog.Title class="confirm-title">{t('settings.persona.resetPromptTitle')}</Dialog.Title>
			<Dialog.Description class="confirm-message">{t('settings.persona.resetPromptBody')}</Dialog.Description>
			<div class="confirm-actions"><Dialog.Close class="btn btn-secondary">{t('common.cancel')}</Dialog.Close><button class="btn btn-danger" onclick={page.resetCustomSystemPrompt}>{t('settings.persona.resetConfirm')}</button></div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.profile-sections { display: flex; flex-direction: column; gap: 24px; }
	.name-field { width: min(100%, 260px); }
	textarea { line-height: 1.6; }
	:global(.confirm-modal) { position: fixed; inset: 0; z-index: 1100; }
	:global(.confirm-content) { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1101; width: min(420px, calc(100vw - 32px)); padding: 24px; }
	:global(.confirm-title) { margin: 0; font-size: 18px; font-weight: 500; color: var(--text-primary); }
	:global(.confirm-message) { margin: 12px 0 24px; color: var(--text-secondary); font-size: 14px; line-height: 1.5; }
	.confirm-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
