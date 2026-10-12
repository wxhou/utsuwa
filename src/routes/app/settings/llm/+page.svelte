<script lang="ts">
	import { getLLMProvider } from '$lib/services/providers/registry';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { createLlmSettingsState, type LlmSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import { createFetchSignature } from '$lib/stores/ai-services-settings-logic';
	import { t } from '$lib/i18n';
	import LlmSettings from '$lib/components/settings/LlmSettings.svelte';
	import '../settings-page.css';

	const state = createLlmSettingsState();
	const visionState = createLlmSettingsState('vision');

	// Fetch local LLM models automatically when the endpoint changes.
	function autoFetchLocalModels(s: LlmSettingsState) {
		$effect(() => {
			const providerId = s.activeProvider;
			const provider = providerId ? getLLMProvider(providerId) : null;
			if (!provider?.isLocal) {
				s.lastLocalLLMFetchKey = '';
				return;
			}

			const baseUrl = settingsStore.getProviderConfig(provider.id).baseUrl ?? provider.defaultBaseUrl ?? '';
			const fetchKey = createFetchSignature(provider.id, baseUrl);

			if (fetchKey !== s.lastLocalLLMFetchKey) {
				s.lastLocalLLMFetchKey = fetchKey;
				s.debouncedFetchLLMModels();
			}
		});
	}
	autoFetchLocalModels(state);
	autoFetchLocalModels(visionState);
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.nav.llm')}</h2>
		<p>{t('settings.llm.pageSubtitle')}</p>
	</header>

	<LlmSettings {state} />
	<LlmSettings state={visionState} />
</div>
