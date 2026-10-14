<script lang="ts">
	import { rangeProgress } from '$lib/utils/range-progress';
	import Select from '$lib/components/ui/Select.svelte';
	import { Tooltip, Icon } from '$lib/components/ui';
	import SettingsSection from './SettingsSection.svelte';
	import VoicePicker from './omnivoice/VoicePicker.svelte';
	import CloneVoiceModal from './omnivoice/CloneVoiceModal.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { t, type DictKey } from '$lib/i18n';
	import type { TtsSettingsState } from '$lib/stores/ai-services-settings.svelte';
	import type { ProviderMetadata } from '$lib/services/providers/registry';
	import { getSharedAudioContext } from '$lib/services/tts';
	import { getTTSBaseUrl } from '$lib/services/providers/local-endpoints';
	import * as omnivoice from '$lib/services/tts/omnivoice-client';
	import {
		DEFAULT_OMNIVOICE_PRESET as DEFAULT_PRESET_VOICE,
		OMNIVOICE_LANGUAGES as languages,
		OMNIVOICE_PARAMS as PARAMS,
		OMNIVOICE_TEST_PHRASES as TEST_PHRASES,
		omnivoicePresetInstructions as deriveInstructions
	} from '$lib/stores/ai-services-settings-logic';

	let { state: settings, provider }: { state: TtsSettingsState; provider: ProviderMetadata } = $props();

	let previewLoading = $state(false);
	let previewErrorKey = $state<DictKey | null>(null);
	let previewErrorText = $state('');
	let previewError = $derived(previewErrorKey ? t(previewErrorKey) : previewErrorText);
	let regenerating = $state(false);
	let profileErrorKey = $state<DictKey | null>(null);
	let profileErrorText = $state('');
	let profileError = $derived(profileErrorKey ? t(profileErrorKey) : profileErrorText);
	let showCloneModal = $state(false);
	let clonedVoices = $state<omnivoice.ClonedVoice[]>([]);
	let cloneDeleting = $state('');
	let proxyStatus = $state<omnivoice.ProxyStatus | 'checking'>('checking');
	const PROXY_STATUS: Record<omnivoice.ProxyStatus | 'checking', [string, DictKey]> = { connected: ['omnivoice-dot-ok', 'settings.omnivoice.proxyConnected'], connecting: ['omnivoice-dot-warn', 'settings.omnivoice.proxyConnecting'],
		disconnected: ['omnivoice-dot-err', 'settings.omnivoice.proxyDisconnected'], checking: ['', 'settings.omnivoice.proxyChecking'] };

	// PARAMS.key is a settings field name; the visible label for it lives in the dictionary
	const PARAM_LABELS: Record<(typeof PARAMS)[number]['key'], DictKey> = {
		speed: 'settings.omnivoice.speed',
		numStep: 'settings.omnivoice.numStep',
		positionTemperature: 'settings.omnivoice.positionTemp',
		classTemperature: 'settings.omnivoice.classTemp'
	};
	const PARAM_ALT_LABELS: Record<(typeof PARAMS)[number]['key'], DictKey> = {
		speed: 'settings.omnivoice.altSpeed',
		numStep: 'settings.omnivoice.altNumStep',
		positionTemperature: 'settings.omnivoice.altPositionTemp',
		classTemperature: 'settings.omnivoice.altClassTemp'
	};

	function setProfileError(err: unknown) {
		if (err instanceof Error) profileErrorText = err.message;
		else profileErrorKey = 'settings.omnivoice.errReset';
	}

	function clearErrors() {
		profileErrorKey = null;
		profileErrorText = '';
		previewErrorKey = null;
		previewErrorText = '';
	}

	const activeVoiceId = $derived(settings.speechSettings.activeVoiceId || '');
	const isClone = $derived(activeVoiceId.startsWith('clone:'));
	const isLanguage = (code: string) => languages.some((l) => l.code === code);
	const activeLanguage = $derived(isLanguage(settings.speechSettings.activeLanguage) ? settings.speechSettings.activeLanguage : 'en');

	const altEnabled = $derived(settings.speechSettings.enableAltLanguage);
	const altLanguage = $derived(isLanguage(settings.speechSettings.altLanguage) ? settings.speechSettings.altLanguage : '');
	const altVoiceId = $derived(settings.speechSettings.altVoiceId);
	const altIsClone = $derived(altVoiceId.startsWith('clone:'));

	const connection = $derived.by<omnivoice.OmniVoiceConnection>(() => {
		const config = settingsStore.getProviderConfig(provider.id);
		return { baseUrl: getTTSBaseUrl('omnivoice', config.baseUrl), apiKey: config.apiKey };
	});

	const altLangOrDefault = () => altLanguage || 'es';

	// Write order matters: it decides key order in the saved JSON the first time.
	function resetVoice(alt: boolean, language = alt ? altLangOrDefault() : activeLanguage) {
		settings.setSpeech(alt ? 'altVoiceId' : 'activeVoiceId', DEFAULT_PRESET_VOICE);
		settings.setSpeech(alt ? 'altInstructions' : 'instructions', deriveInstructions(DEFAULT_PRESET_VOICE, language));
	}

	function pickPreset(alt: boolean, voiceId: string, language = alt ? altLangOrDefault() : activeLanguage) {
		settings.setSpeech(alt ? 'altInstructions' : 'instructions', deriveInstructions(voiceId, language));
		settings.setSpeech(alt ? 'altVoiceId' : 'activeVoiceId', voiceId);
	}

	function handleLanguageChange(language: string) {
		settings.setSpeech('activeLanguage', language);
		if (!isClone) pickPreset(false, activeVoiceId || DEFAULT_PRESET_VOICE, language);
	}

	function handleAltLanguageChange(language: string) {
		settings.setSpeech('altLanguage', language);
		if (!altIsClone) settings.setSpeech('altInstructions', deriveInstructions(altVoiceId || DEFAULT_PRESET_VOICE, language));
	}

	function switchToClone(alt: boolean) {
		if (alt ? altIsClone : isClone) return;
		const first = clonedVoices[0];
		if (first) settings.setSpeech(alt ? 'altVoiceId' : 'activeVoiceId', first.id);
		else showCloneModal = true;
	}

	function initializeProfile(voice: string, instructions: string, language: string) {
		omnivoice.initializeProfile(connection, { voice, instructions, language }).catch((err) => {
			profileErrorKey = null;
			profileErrorText = '';
			setProfileError(err);
		});
	}

	async function regenerateProfile() {
		regenerating = true;
		profileErrorKey = null;
		profileErrorText = '';
		try {
			const voiceId = activeVoiceId || DEFAULT_PRESET_VOICE;
			await omnivoice.resetProfile(connection, {
				voice: isClone ? voiceId.replace('clone:', '') : voiceId,
				language: activeLanguage,
				instructions: isClone ? undefined : settings.speechSettings.instructions || deriveInstructions(voiceId, activeLanguage)
			});
		} catch (err) {
			setProfileError(err);
		} finally {
			regenerating = false;
		}
	}

	async function fetchClonedVoices() {
		try {
			clonedVoices = (await omnivoice.listClones(connection)) ?? clonedVoices;
		} catch (err) {
			clonedVoices = [];
			if (import.meta.env.DEV) console.debug('Clone list fetch failed:', err);
		}
	}

	async function checkProxyHealth() {
		proxyStatus = 'connecting';
		proxyStatus = await omnivoice.checkHealth(connection.baseUrl);
	}

	$effect(() => {
		if (!isLanguage(settings.speechSettings.activeLanguage)) settings.setSpeech('activeLanguage', 'en');
		if (!activeVoiceId && !isClone) resetVoice(false);
		if (!settings.speechSettings.instructions && !isClone) {
			settings.setSpeech('instructions', deriveInstructions(activeVoiceId, activeLanguage));
		}
	});

	// Clone list and health polling follow the proxy endpoint.
	$effect(() => {
		fetchClonedVoices();
		proxyStatus = 'checking';
		checkProxyHealth();
		const timer = setInterval(checkProxyHealth, 5000);
		return () => clearInterval(timer);
	});

	// Warm the synthetic voice profile whenever its voice or language changes.
	$effect(() => {
		if (isClone) return;
		const voice = activeVoiceId || DEFAULT_PRESET_VOICE;
		initializeProfile(voice, settings.speechSettings.instructions || deriveInstructions(voice, activeLanguage), activeLanguage);
	});

	// First enable of the alternative voice gets sensible defaults.
	$effect(() => {
		if (!altEnabled) return;
		const lang = altLangOrDefault();
		if (!altLanguage) settings.setSpeech('altLanguage', lang);
		if (!altVoiceId) resetVoice(true, lang);
	});

	// Pre-warm the alternative profile so the first foreign word does not stall.
	$effect(() => {
		if (!altEnabled || altIsClone || !altLanguage) return;
		const voice = altVoiceId || DEFAULT_PRESET_VOICE;
		initializeProfile(voice, settings.speechSettings.altInstructions || deriveInstructions(voice, altLanguage), altLanguage);
	});

	async function preview(alt: boolean) {
		previewLoading = true;
		previewErrorKey = null;
		previewErrorText = '';
		try {
			const s = settings.speechSettings;
			const language = alt ? altLangOrDefault() : activeLanguage;
			const voice = alt ? altVoiceId : activeVoiceId;
			const [speed, numStep, positionTemperature, classTemperature] = PARAMS.map((p) => s[alt ? p.altKey : p.key]);
			const instructions = (alt ? altIsClone : isClone)
				? undefined
				: (alt ? s.altInstructions : s.instructions) || deriveInstructions(voice, language);
			const input = TEST_PHRASES[language] || TEST_PHRASES.en;
			const body = omnivoice.previewBody({ input, language, voice, instructions, speed, numStep, positionTemperature, classTemperature });
			const audio = await omnivoice.synthesize(connection, body);
			const ctx = getSharedAudioContext();
			if (ctx.state === 'suspended') await ctx.resume();
			const source = ctx.createBufferSource();
			source.buffer = await ctx.decodeAudioData(audio);
			source.connect(ctx.destination);
			source.start(0);
		} catch (err) {
			if (err instanceof Error) previewErrorText = err.message;
			else previewErrorKey = 'settings.omnivoice.previewFailed';
		} finally {
			previewLoading = false;
		}
	}

	async function deleteClone(cloneId: string, alt: boolean) {
		cloneDeleting = cloneId;
		try {
			await omnivoice.deleteClone(connection, cloneId);
			if ((alt ? altVoiceId : activeVoiceId) === 'clone:' + cloneId) resetVoice(alt);
			await fetchClonedVoices();
		} catch {
			/* ignore */
		}
		cloneDeleting = '';
	}

	async function handleCloned(voiceId: string) {
		settings.setSpeech('activeVoiceId', voiceId);
		showCloneModal = false;
		await fetchClonedVoices();
	}
</script>

{#snippet voicePicker(alt: boolean)}
	<VoicePicker id={alt ? 'omnivoice-alt-voice' : 'omnivoice-voice'} label={alt ? t('settings.omnivoice.altVoice') : t('settings.omnivoice.primaryVoice')}
		voiceId={alt ? altVoiceId : activeVoiceId} isClone={alt ? altIsClone : isClone} presets={provider.voices ?? []} clones={clonedVoices} deleting={cloneDeleting}
		onchange={(id) => ((alt ? altIsClone : isClone) ? settings.setSpeech(alt ? 'altVoiceId' : 'activeVoiceId', id) : id && pickPreset(alt, id))}
		onDelete={(cloneId) => deleteClone(cloneId, alt)} onCloneNew={() => (showCloneModal = true)} />
{/snippet}

{#snippet modeRadios(alt: boolean)}
	{@const clone = alt ? altIsClone : isClone}
	<span class="omnivoice-design-label">{t('settings.omnivoice.mode')}</span>
	<label class="omnivoice-radio">
		<input type="radio" name={alt ? 'ov-alt-mode' : 'ov-mode'} value="synth" checked={!clone} onchange={() => resetVoice(alt)} />
		{t('settings.omnivoice.synthetic')}
	</label>
	<label class="omnivoice-radio">
		<input type="radio" name={alt ? 'ov-alt-mode' : 'ov-mode'} value="clone" checked={clone} onchange={() => switchToClone(alt)} />
		{t('settings.omnivoice.cloned')}
	</label>
{/snippet}

{#snippet slider(p: (typeof PARAMS)[number], alt: boolean, id: string)}
	{@const key = alt ? p.altKey : p.key}
	<input {id} type="range" use:rangeProgress={settings.speechSettings[key]} min={p.min} max={p.max} step={p.step} class="settings-range omnivoice-slider" value={settings.speechSettings[key]} oninput={(e) => settings.setSpeech(key, Number(e.currentTarget.value))} />
	<span class="omnivoice-slider-val">{settings.speechSettings[key]}</span>
{/snippet}

{#snippet params(alt: boolean)}
	<div class="omnivoice-design-grid-2">
		{#each PARAMS.slice(0, 2) as p (p.key)}
			{@const id = `omnivoice-${alt ? 'alt-' : ''}${p.id}`}
			<div class="omnivoice-design-row">
				<label class="omnivoice-design-label" for={id}>{t(alt ? PARAM_ALT_LABELS[p.key] : PARAM_LABELS[p.key])}</label>
				{@render slider(p, alt, id)}
			</div>
		{/each}
	</div>
	<div class="omnivoice-design-grid-2">
		{#each PARAMS.slice(2) as p (p.key)}
			{@const id = `omnivoice-${alt ? 'alt-' : ''}${p.id}`}
			<div class="omnivoice-advanced-slider">
				<label class="omnivoice-advanced-label" for={id}>{t(alt ? PARAM_ALT_LABELS[p.key] : PARAM_LABELS[p.key])}</label>
				<div class="omnivoice-advanced-row">{@render slider(p, alt, id)}</div>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet testButton(alt: boolean)}
	<button class="btn btn-sm btn-primary" onclick={() => preview(alt)} disabled={previewLoading}>
		{#if previewLoading}
			<span class="omnivoice-spinner"></span> {t('settings.omnivoice.testing')}
		{:else}
			<Icon name="play" size={14} /> {alt ? t('settings.omnivoice.testAlt') : t('settings.omnivoice.test')}
		{/if}
	</button>
{/snippet}

<div class="omnivoice-card">
	<div class="omnivoice-field">
		<label class="omnivoice-label" for="omnivoice-base-url">
			<span>{t('settings.omnivoice.proxy')}</span>
			<span class="omnivoice-proxy-status"><span class="omnivoice-dot {PROXY_STATUS[proxyStatus][0]}"></span> {t(PROXY_STATUS[proxyStatus][1])}</span>
		</label>
		<input id="omnivoice-base-url" type="text" class="api-key-input" placeholder={provider.defaultBaseUrl || 'http://localhost:8881/v1/'} value={settingsStore.getProviderConfig(provider.id).baseUrl ?? ''}
			onchange={(e) => settingsStore.setProviderConfig(provider.id, { baseUrl: e.currentTarget.value })} />
	</div>
</div>

{#if profileError || previewError}
	<div class="omnivoice-error" role="alert">
		{profileError || previewError}
		<button class="omnivoice-error-close btn btn-ghost btn-sm" onclick={clearErrors} aria-label={t('settings.omnivoice.dismissError')}><Icon name="x" size={14} /></button>
	</div>
{/if}

<SettingsSection title={t('settings.omnivoice.primaryVoice')} outlined>
	<div class="omnivoice-design-grid-2">
		<div class="omnivoice-field">
			<label class="omnivoice-label" for="omnivoice-language">{t('settings.omnivoice.language')}</label>
			<Select id="omnivoice-language" label={t('settings.omnivoice.language')} value={activeLanguage} onchange={handleLanguageChange} options={languages.map((lang) => ({ value: lang.code, label: lang.name }))} />
		</div>
		{@render voicePicker(false)}
	</div>

	<div class="omnivoice-voice-row">
		{@render modeRadios(false)}
		<span style="flex:1;"></span>
		<button class="btn btn-sm btn-secondary" onclick={regenerateProfile} disabled={regenerating || isClone} title={isClone ? t('settings.omnivoice.regenerateCloneTitle') : ''}>
			{#if regenerating}
				<span class="omnivoice-spinner"></span> {t('settings.omnivoice.regenerating')}
			{:else}
				<Icon name="refresh-cw" size={14} /> {t('settings.omnivoice.regenerate')}
			{/if}
		</button>
		{@render testButton(false)}
	</div>

	{@render params(false)}
</SettingsSection>

<SettingsSection title={t('settings.omnivoice.altVoice')} outlined>
	<div class="omnivoice-voice-row">
		<label class="omnivoice-radio">
			<input type="checkbox" checked={altEnabled} onchange={(e) => settings.setSpeech('enableAltLanguage', e.currentTarget.checked)} />
			{t('settings.omnivoice.speakForeign')}
		</label>
		<span style="flex:1;"></span>
		{#if altEnabled}{@render testButton(true)}{/if}
	</div>

	{#if altEnabled}
		<div class="omnivoice-design-grid-2">
			<div class="omnivoice-field">
				<label class="omnivoice-label" for="omnivoice-alt-language">{t('settings.omnivoice.language')}</label>
				<Select id="omnivoice-alt-language" label={t('settings.omnivoice.altLanguage')} value={altLanguage} onchange={handleAltLanguageChange} placeholder={t('settings.omnivoice.selectLanguage')} options={languages.filter((lang) => lang.code !== activeLanguage).map((lang) => ({ value: lang.code, label: lang.name }))} />
			</div>
			{@render voicePicker(true)}
		</div>

		<div class="omnivoice-voice-row">
			<label class="omnivoice-radio">
				<input type="checkbox" checked={settings.speechSettings.enableToolCalling} onchange={(e) => settings.setSpeech('enableToolCalling', e.currentTarget.checked)} />
				<span>{t('settings.omnivoice.forceLanguage')}</span>
			</label>
			<Tooltip content={t('settings.omnivoice.forceLanguageTip')}><Icon name="info" size={16} /></Tooltip>
		</div>

		<div class="omnivoice-voice-row">{@render modeRadios(true)}</div>

		{@render params(true)}
	{/if}
</SettingsSection>

{#if showCloneModal}
	<CloneVoiceModal {connection} onClose={() => (showCloneModal = false)} onCloned={handleCloned} />
{/if}

<style>
	.omnivoice-card { background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 1rem; margin-top: 0.25rem; }
	.omnivoice-field { min-width: 0; display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
	.omnivoice-field:last-child { margin-bottom: 0; }
	.omnivoice-label {
		display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.375rem;
		font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary);
	}
	.omnivoice-proxy-status {
		display: flex; align-items: center; gap: 0.3rem; white-space: nowrap;
		font-size: 0.8125rem; font-weight: 500; color: var(--text-tertiary);
	}
	.omnivoice-dot { width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--text-tertiary); flex-shrink: 0; }
	.omnivoice-dot-ok { background: var(--color-success); }
	.omnivoice-dot-warn { background: var(--color-warning); }
	.omnivoice-dot-err { background: var(--color-error); }

	.omnivoice-voice-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
	.omnivoice-voice-row:last-child { margin-bottom: 0; }
	.omnivoice-voice-row .btn { white-space: nowrap; flex-shrink: 0; }
	.omnivoice-radio {
		display: flex; align-items: center; gap: 0.5rem; min-height: 44px;
		font-size: 0.875rem; color: var(--text-secondary); cursor: pointer; white-space: normal;
	}
	.omnivoice-radio input { accent-color: var(--accent); margin: 0; }

	.omnivoice-design-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 0.75rem; }
	.omnivoice-design-grid-2 + .omnivoice-design-grid-2 { margin-top: 0.4rem; padding-top: 0.5rem; border-top: 1px solid var(--border-subtle); }
	.omnivoice-design-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem; min-width: 0; }
	.omnivoice-design-label { font-size: 0.8125rem; font-weight: 500; color: var(--text-tertiary); flex-shrink: 0; text-align: left; }
	.omnivoice-advanced-slider { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
	.omnivoice-advanced-label { font-size: 0.8125rem; font-weight: 500; color: var(--text-tertiary); }
	.omnivoice-advanced-row { display: flex; align-items: center; gap: 0.3rem; min-width: 0; }
	.omnivoice-slider { flex: 1; min-width: 0; accent-color: var(--accent); cursor: pointer; }
	.omnivoice-slider-val { font-size: 0.8125rem; color: var(--text-secondary); width: 2.2em; text-align: center; font-family: var(--font-mono); }

	.omnivoice-spinner {
		display: inline-block; width: 12px; height: 12px; vertical-align: middle; margin-right: 0.25rem;
		border: 2px solid color-mix(in srgb, currentColor 30%, transparent); border-top-color: currentColor; border-radius: 50%;
		animation: ov-spin 0.6s linear infinite;
	}
	@keyframes ov-spin { to { transform: rotate(360deg); } }

	.omnivoice-error {
		display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
		padding: 0.5rem 0.75rem; margin-top: 0.5rem; font-size: 0.8rem;
		background: var(--color-error-bg); color: var(--color-error-text);
		border: 1px solid var(--color-error); border-radius: var(--radius-lg);
	}
	.omnivoice-error-close { background: transparent; border: none; color: inherit; font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 0 0.2rem; }

	@media (max-width: 640px) {
		.omnivoice-design-grid-2 { grid-template-columns: minmax(0, 1fr); }
		.omnivoice-voice-row .btn { min-height: 44px; }
	}
	@media (prefers-reduced-motion: reduce) { .omnivoice-spinner { animation: none; } }
</style>
