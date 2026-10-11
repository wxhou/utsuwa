<script lang="ts">
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import { t } from '$lib/i18n';
	import type { PersonaPageState } from './persona-page.svelte';

	let { page }: { page: PersonaPageState } = $props();
</script>

<!-- App Mode Toggle -->
<div class="mode-section">
	<span class="settings-label">{t('settings.persona.appMode')}</span>
	<SegmentedControl label={t('settings.persona.appMode')} value={page.appMode} onchange={page.requestModeChange}
		options={[{ value: 'companion', label: t('onboarding.companion'), icon: 'sparkles' }, { value: 'dating_sim', label: t('onboarding.datingSim'), icon: 'heart' }]} />
</div>

<style>
	/* Mode Section */
	.mode-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid var(--border-light);
	}

</style>
