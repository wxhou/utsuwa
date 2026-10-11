<script lang="ts">
	import Switch from '$lib/components/ui/Switch.svelte';
	import { t } from '$lib/i18n';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getTTSProvider } from '$lib/services/providers/registry';
	import { Icon, ProviderDropdown, ModelDropdown } from '$lib/components/ui';
	import OmniVoiceSettings from './OmniVoiceSettings.svelte';

import { checkTTSProviderHealth } from '$lib/services/providers/health-check';
	import type { TtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import './ai-services-settings.css';

	let { state }: { state: TtsSettingsState } = $props();
</script>

<div class="service-group">
	<div class="service-header">
		<Icon name="mic" size={14} />
		<span>{t('onboarding.speechTts')}</span>
		<Switch checked={state.isTTSEnabled} onchange={state.toggleTTS} label="Speech (TTS)" />
	</div>

	{#if state.isTTSEnabled}
		<ProviderDropdown
			type="tts"
			value={state.speechSettings.activeProvider as string}
			onSelect={state.handleTTSProviderChange}
			placeholder={t('onboarding.selectTtsProvider')}
		/>

		{#if state.speechSettings.activeProvider}
			{@const provider = getTTSProvider(state.speechSettings.activeProvider as string)}

			{#if provider?.requiresApiKey}
				<div class="api-key-row">
					<input
						type="password"
						class="api-key-input"
						class:error={state.ttsFetchError}
						placeholder={t('settings.llm.apiKey')} aria-label={t('settings.llm.apiKey')}
						value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
						oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
						onblur={state.handleTTSApiKeyBlur}
					/>
				</div>
			{/if}

			{#if !provider?.isLocal}
				<ModelDropdown
					models={state.ttsModels}
					value={state.speechSettings.activeModel as string}
					onSelect={state.handleTTSModelChange}
					placeholder={t('onboarding.selectModel')}
					isLoading={state.ttsIsLoading}
					onRefresh={state.ttsHasApiKey ? state.fetchTTSModels : undefined}
					disabled={!state.ttsHasApiKey}
					disabledMessage="Enter API key first"
				/>
			{/if}

			{#if state.speechSettings.activeProvider === 'elevenlabs'}
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						list="elevenlabs-voices"
						placeholder={t('onboarding.voiceId')} aria-label={t('onboarding.voiceId')}
						value={state.speechSettings.activeVoiceId as string ?? ''}
						onchange={(e) => state.handleTTSVoiceChange(e.currentTarget.value)}
					/>
					<datalist id="elevenlabs-voices">
						{#each provider?.voices ?? [] as voice}
							<option value={voice.id}>{voice.name}</option>
						{/each}
					</datalist>
				</div>
			{/if}

			{#if provider?.isLocal && state.speechSettings.activeProvider !== 'omnivoice'}
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						list="local-tts-voices"
						placeholder={t('settings.tts.voice')} aria-label={t('settings.tts.voice')}
						value={state.speechSettings.activeVoiceId as string ?? ''}
						onchange={(e) => state.handleTTSVoiceChange(e.currentTarget.value)}
					/>
					<datalist id="local-tts-voices">
						{#each provider.voices ?? [] as voice}
							<option value={voice.id}>{voice.name}</option>
						{/each}
					</datalist>
				</div>
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						placeholder={t('settings.tts.modelOptional')} aria-label={t('settings.tts.modelOptional')}
						value={state.speechSettings.activeModel as string ?? ''}
						onchange={(e) => state.handleTTSModelChange(e.currentTarget.value)}
					/>
				</div>
				<div class="api-key-row">
					<input
						type="text"
						class="api-key-input"
						placeholder={provider.defaultBaseUrl || 'http://localhost:8880/v1/'} aria-label={provider.defaultBaseUrl || 'http://localhost:8880/v1/'}
						value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
						onchange={(e) => {
							settingsStore.setProviderConfig(provider.id, { baseUrl: e.currentTarget.value });
							checkTTSProviderHealth(provider.id, e.currentTarget.value);
						}}
					/>
				</div>
			{/if}

			{#if provider && state.speechSettings.activeProvider === 'omnivoice'}
				<OmniVoiceSettings {state} {provider} />
			{/if}
		{/if}
	{/if}
</div>
