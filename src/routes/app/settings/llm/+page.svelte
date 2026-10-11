<script lang="ts">
	import { getLLMProvider } from '$lib/services/providers/registry';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { createLlmSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import { createFetchSignature } from '$lib/stores/ai-services-settings-logic';
	import { t } from '$lib/i18n';
	import LlmSettings from '$lib/components/settings/LlmSettings.svelte';
	import '../settings-page.css';

	const state = createLlmSettingsState();

	// Fetch local LLM models automatically when the endpoint changes.
	$effect(() => {
		const providerId = state.consciousnessSettings.activeProvider as string;
		const provider = providerId ? getLLMProvider(providerId) : null;
		if (!provider?.isLocal) {
			state.lastLocalLLMFetchKey = '';
			return;
		}

		const baseUrl = settingsStore.getProviderConfig(provider.id).baseUrl ?? provider.defaultBaseUrl ?? '';
		const fetchKey = createFetchSignature(provider.id, baseUrl);

		if (fetchKey !== state.lastLocalLLMFetchKey) {
			state.lastLocalLLMFetchKey = fetchKey;
			state.debouncedFetchLLMModels();
		}
	});
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.nav.llm')}</h2>
		<p>{t('settings.llm.pageSubtitle')}</p>
	</header>

	<section class="section">
		<LlmSettings {state} />
	</section>
</div>
