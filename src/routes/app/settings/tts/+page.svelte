<script lang="ts">
	import { createTtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import { t } from '$lib/i18n';
	import TtsSettings from '$lib/components/settings/TtsSettings.svelte';
	import '../settings-page.css';

	const state = createTtsSettingsState();
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.tts.title')}</h2>
		<p>{t('settings.tts.subtitle')}</p>
	</header>

	<TtsSettings {state} />
</div>
