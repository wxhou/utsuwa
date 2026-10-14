<script lang="ts">
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { t } from '$lib/i18n';
	import { DEFAULT_STT_TIMEOUT_MS, resolveSttTimeoutMs } from '$lib/services/stt/openai-stt';
	import SettingsSection from './SettingsSection.svelte';
</script>

<SettingsSection
	title={t('settings.stt.cloudTitle')}
	description={t('settings.stt.cloudDesc')}
>
	<div class="ai-fields">
		<div class="ai-field">
			<label class="settings-label" for="stt-groq-key">{t('settings.stt.groqKeyLabel')}</label>
			<input
				id="stt-groq-key"
				type="password"
				class="settings-field"
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
		<div class="ai-field">
			<label class="settings-label" for="stt-openai-key">{t('settings.stt.openaiLabel')}</label>
			<input
				id="stt-openai-key"
				type="password"
				class="settings-field"
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
		<div class="ai-field">
			<label class="settings-label" for="stt-siliconflow-key">{t('settings.stt.siliconflowKeyLabel')}</label>
			<input
				id="stt-siliconflow-key"
				type="password"
				class="settings-field"
				placeholder={t('settings.stt.siliconflowKeyPh')} aria-label={t('settings.stt.siliconflowKeyPh')}
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
		<div class="ai-field">
			<label class="settings-label" for="stt-siliconflow-model">{t('settings.stt.siliconflowModel')}</label>
			<input
				id="stt-siliconflow-model"
				type="text"
				class="settings-field"
				placeholder="SenseVoiceSmall"
				aria-label={t('settings.stt.siliconflowModelAria')}
				value={settingsStore.getProviderConfig('siliconflow').modelId ?? ''}
				oninput={(e) => {
					settingsStore.setProviderConfig('siliconflow', { modelId: e.currentTarget.value.trim() });
				}}
			/>
		</div>
	</div>
</SettingsSection>

<SettingsSection
	title={t('settings.stt.localTitle')}
	description={t('settings.stt.localDesc')}
>
	<div class="ai-fields">
		<div class="ai-field">
			<label class="settings-label" for="stt-local-url">{t('settings.stt.serverUrl')}</label>
			<input
				id="stt-local-url"
				type="text"
				class="settings-field"
				placeholder="http://localhost:8000/v1/" aria-label="http://localhost:8000/v1/"
				value={settingsStore.getProviderConfig('local-stt').baseUrl ?? ''}
				oninput={(e) => {
					const v = e.currentTarget.value.trim();
					settingsStore.setProviderConfig('local-stt', { baseUrl: v });
					if (v) settingsStore.markProviderAdded('local-stt');
					else settingsStore.removeProvider('local-stt');
				}}
			/>
		</div>
		<div class="ai-field">
			<label class="settings-label" for="stt-local-model">{t('settings.fields.model')}</label>
			<input
				id="stt-local-model"
				type="text"
				class="settings-field"
				placeholder={t('settings.stt.localModel')} aria-label={t('settings.stt.localModel')}
				value={settingsStore.getProviderConfig('local-stt').modelId ?? ''}
				oninput={(e) => {
					settingsStore.setProviderConfig('local-stt', { modelId: e.currentTarget.value.trim() });
				}}
			/>
		</div>
		<div class="ai-field">
			<label class="settings-label" for="stt-local-timeout">{t('settings.stt.timeout')}</label>
			<input
				id="stt-local-timeout"
				type="number"
				class="settings-field"
				min="5"
				max="600"
				step="5"
				value={Math.round((settingsStore.getProviderConfig('local-stt').timeoutMs ?? DEFAULT_STT_TIMEOUT_MS) / 1000)}
				onchange={(e) => {
					// change, not input: clamping per keystroke would fight the user mid-typing
					const timeoutMs = resolveSttTimeoutMs(e.currentTarget.valueAsNumber);
					settingsStore.setProviderConfig('local-stt', { timeoutMs });
					e.currentTarget.value = String(timeoutMs / 1000);
				}}
			/>
			<p class="hint">{t('settings.stt.timeoutHint')}</p>
		</div>
	</div>
</SettingsSection>
