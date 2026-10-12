<script lang="ts">
	import { t } from '$lib/i18n';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { Icon } from '$lib/components/ui';
	import './ai-services-settings.css';
</script>

<div class="service-group">
	<div class="service-header">
		<Icon name="mic" size={14} />
		<span>{t('onboarding.voiceInputStt')}</span>
	</div>
	<p class="stt-hint">{t('settings.stt.hint')}</p>

	<span class="stt-sublabel">{t('settings.stt.groqLabel')}</span>
	<div class="api-key-row">
		<input
			type="password"
			class="api-key-input"
			placeholder={t('settings.stt.groqKey')} aria-label={t('settings.stt.groqKey')}
			value={settingsStore.getProviderConfig('groq-stt').apiKey ?? ''}
			oninput={(e) => {
				const v = e.currentTarget.value;
				settingsStore.setProviderConfig('groq-stt', { apiKey: v });
				if (v) settingsStore.markProviderAdded('groq-stt');
				else settingsStore.removeProvider('groq-stt');
			}}
		/>
	</div>

	<span class="stt-sublabel">{t('settings.stt.openaiLabel')}</span>
	<div class="api-key-row">
		<input
			type="password"
			class="api-key-input"
			placeholder={t('settings.stt.openaiKey')} aria-label={t('settings.stt.openaiKey')}
			value={settingsStore.getProviderConfig('openai-stt').apiKey ?? ''}
			oninput={(e) => {
				const v = e.currentTarget.value;
				settingsStore.setProviderConfig('openai-stt', { apiKey: v });
				if (v) settingsStore.markProviderAdded('openai-stt');
				else settingsStore.removeProvider('openai-stt');
			}}
		/>
	</div>

	<span class="stt-sublabel">SiliconFlow</span>
	<div class="api-key-row">
		<input
			type="password"
			class="api-key-input"
			placeholder={t('settings.stt.openaiKey')} aria-label={t('settings.stt.openaiKey')}
			value={settingsStore.getProviderConfig('siliconflow').apiKey ?? ''}
			oninput={(e) => {
				const v = e.currentTarget.value;
				// Config is shared with the TTS siliconflow entry (one key serves
				// both); only clear the key so the TTS voice/model survive.
				settingsStore.setProviderConfig('siliconflow', { apiKey: v });
				if (v) settingsStore.markProviderAdded('siliconflow');
			}}
		/>
	</div>
	<div class="api-key-row">
		<input
			type="text"
			class="api-key-input"
			placeholder={t('settings.stt.localModel')} aria-label={t('settings.stt.localModel')}
			value={settingsStore.getProviderConfig('siliconflow').modelId ?? ''}
			oninput={(e) => {
				settingsStore.setProviderConfig('siliconflow', { modelId: e.currentTarget.value.trim() });
			}}
		/>
	</div>

	<span class="stt-sublabel">{t('settings.stt.localServerLabel')}</span>
	<div class="api-key-row">
		<input
			type="text"
			class="api-key-input"
			placeholder={t('onboarding.sttServerUrl')} aria-label={t('onboarding.sttServerUrl')}
			value={settingsStore.getProviderConfig('local-stt').baseUrl ?? ''}
			oninput={(e) => {
				const v = e.currentTarget.value.trim();
				settingsStore.setProviderConfig('local-stt', { baseUrl: v });
				if (v) settingsStore.markProviderAdded('local-stt');
				else settingsStore.removeProvider('local-stt');
			}}
		/>
	</div>
	<div class="api-key-row">
		<input
			type="text"
			class="api-key-input"
			placeholder={t('settings.stt.localModel')} aria-label={t('settings.stt.localModel')}
			value={settingsStore.getProviderConfig('local-stt').modelId ?? ''}
			oninput={(e) => {
				settingsStore.setProviderConfig('local-stt', { modelId: e.currentTarget.value.trim() });
			}}
		/>
	</div>
</div>

<style>
	.stt-hint {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		margin: 0;
		line-height: 1.4;
	}

	.stt-sublabel {
		display: block;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-secondary);
		margin-top: 0.25rem;
	}
</style>
