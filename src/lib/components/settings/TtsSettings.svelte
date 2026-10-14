<script lang="ts">
	import Switch from '$lib/components/ui/Switch.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { getTTSProvider } from '$lib/services/providers/registry';
	import { ProviderDropdown, ModelDropdown } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import OmniVoiceSettings from './OmniVoiceSettings.svelte';
	import SettingsSection from './SettingsSection.svelte';
	import { checkTTSProviderHealth } from '$lib/services/providers/health-check';
	import type { TtsSettingsState } from '$lib/stores/ai-services-settings.svelte';

	let { state }: { state: TtsSettingsState } = $props();
</script>

<SettingsSection title={t('settings.tts.speechTitle')}>
	{#snippet actions()}<Switch checked={state.isTTSEnabled} onchange={state.toggleTTS} label={t('settings.tts.speechTitle')} />{/snippet}
	<div class="ai-fields">
		{#if state.isTTSEnabled}
			<div class="ai-field">
				<span class="settings-label">{t('settings.fields.provider')}</span>
				<ProviderDropdown
					type="tts"
					value={state.speechSettings.activeProvider}
					onSelect={state.handleTTSProviderChange}
					placeholder={t('settings.tts.providerPh')}
				/>
			</div>

			{#if state.speechSettings.activeProvider}
				{@const provider = getTTSProvider(state.speechSettings.activeProvider)}

				{#if provider?.requiresApiKey}
					<div class="ai-field">
						<label class="settings-label" for="tts-api-key">{t('settings.fields.apiKey')}</label>
						<input
							id="tts-api-key"
							type="password"
							class="settings-field"
							class:error={state.ttsFetchError}
							placeholder={t('settings.fields.apiKeyPh')} aria-label={t('settings.fields.apiKeyPh')}
							value={settingsStore.getProviderConfig(provider.id).apiKey ?? ''}
							oninput={(e) => state.handleApiKeyChange(provider.id, e.currentTarget.value)}
							onblur={state.handleTTSApiKeyBlur}
						/>
					</div>
				{/if}

				{#if !provider?.isLocal}
					<div class="ai-field">
						<span class="settings-label">{t('settings.fields.model')}</span>
						<ModelDropdown
							models={state.ttsModels}
							value={state.speechSettings.activeModel}
							onSelect={(id) => state.setSpeech('activeModel', id)}
							placeholder={t('settings.fields.selectModel')}
							isLoading={state.ttsIsLoading}
							onRefresh={state.ttsHasApiKey ? state.fetchTTSModels : undefined}
							disabled={!state.ttsHasApiKey}
							disabledMessage={t('settings.fields.enterKeyFirst')}
						/>
					</div>
				{/if}

				{#if provider?.id === 'elevenlabs' || provider?.id === 'fish-audio' || provider?.id === 'minimax' || provider?.id === 'siliconflow'}
					<div class="ai-field">
						<label class="settings-label" for="tts-voice-id">{t('settings.tts.voiceId')}</label>
						<input
							id="tts-voice-id"
							type="text"
							class="settings-field"
							list="{provider.id}-voices"
							placeholder={t('settings.tts.voiceIdPh')} aria-label={t('settings.tts.voiceIdPh')}
							value={state.speechSettings.activeVoiceId ?? ''}
							onchange={(e) => state.setSpeech('activeVoiceId', e.currentTarget.value.trim())}
						/>
						<datalist id="{provider.id}-voices">
							{#each provider?.voices ?? [] as voice}
								<option value={voice.id}>{voice.name}</option>
							{/each}
						</datalist>
					</div>
				{/if}

				{#if provider?.isLocal && state.speechSettings.activeProvider !== 'omnivoice'}
					<div class="ai-field">
						<label class="settings-label" for="tts-local-voice">{t('settings.tts.voiceLabel')}</label>
						<input
							id="tts-local-voice"
							type="text"
							class="settings-field"
							list="local-tts-voices"
							placeholder={t('settings.tts.voice')} aria-label={t('settings.tts.voice')}
							value={state.speechSettings.activeVoiceId ?? ''}
							onchange={(e) => state.setSpeech('activeVoiceId', e.currentTarget.value.trim())}
						/>
						<datalist id="local-tts-voices">
							{#each provider.voices ?? [] as voice}
								<option value={voice.id}>{voice.name}</option>
							{/each}
						</datalist>
					</div>
					<div class="ai-field">
						<label class="settings-label" for="tts-local-model">{t('settings.tts.modelOptionalLabel')}</label>
						<input
							id="tts-local-model"
							type="text"
							class="settings-field"
							placeholder={t('settings.tts.modelOptional')} aria-label={t('settings.tts.modelOptional')}
							value={state.speechSettings.activeModel ?? ''}
							onchange={(e) => state.setSpeech('activeModel', e.currentTarget.value)}
						/>
					</div>
					<div class="ai-field">
						<label class="settings-label" for="tts-base-url">{t('settings.fields.baseUrl')}</label>
						<input
							id="tts-base-url"
							type="text"
							class="settings-field"
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

				<div class="ai-field">
					<label class="settings-label" for="tts-volume">{t('settings.tts.volume')}</label>
					<input
						id="tts-volume"
						type="number"
						class="settings-field"
						min="0"
						max="2"
						step="0.1"
						placeholder="1.0"
						value={state.speechSettings.volume ?? 1}
						onchange={(e) =>
							state.setSpeech(
								'volume',
								Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : 1
							)}
					/>
				</div>
			{/if}
		{:else}
			<p class="hint">{t('settings.tts.offHint')}</p>
		{/if}
	</div>
</SettingsSection>
