<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { t, type DictKey } from '$lib/i18n';
	import { cloneVoice, type OmniVoiceConnection } from '$lib/services/tts/omnivoice-client';

	interface Props {
		connection: OmniVoiceConnection;
		onClose: () => void;
		/** Receives the new voice id, already prefixed with clone:. */
		onCloned: (voiceId: string) => void;
	}

	let { connection, onClose, onCloned }: Props = $props();

	let name = $state('');
	let refText = $state('');
	let refAudio = $state<File | null>(null);
	let loading = $state(false);
	let errorKey = $state<DictKey | null>(null);
	let errorText = $state('');
	let error = $derived(errorKey ? t(errorKey) : errorText);

	async function submit() {
		errorKey = null;
		errorText = '';
		if (!name.trim() || !refAudio || !refText.trim()) {
			errorKey = 'settings.omnivoice.errMissing';
			return;
		}
		loading = true;
		try {
			await cloneVoice(connection, { voiceId: name.trim(), refAudio, refText: refText.trim() });
			onCloned('clone:' + name.trim());
		} catch (err) {
			if (err instanceof Error) errorText = err.message;
			else errorKey = 'settings.omnivoice.cloneFailed';
		} finally {
			loading = false;
		}
	}
</script>

<Dialog.Root open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
<Dialog.Portal>
 <Dialog.Overlay class="ui-dialog-backdrop" />
 <Dialog.Content>
 {#snippet child({ props })}
 <div {...props} class="clone-modal ui-dialog">
		<Dialog.Title level={3}>
			{#snippet child({ props })}<h3 {...props} class="omnivoice-modal-title">{t('settings.omnivoice.cloneNewVoice')}</h3>{/snippet}
		</Dialog.Title>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-audio">{t('settings.omnivoice.referenceAudio')}</label>
			<div class="omnivoice-file-row">
				<label class="btn btn-sm btn-secondary" for="clone-audio">{refAudio?.name || t('settings.omnivoice.chooseFile')}</label>
				<input type="file" accept="audio/*" id="clone-audio" class="omnivoice-hidden-input" onchange={(e) => (refAudio = e.currentTarget.files?.[0] ?? null)} />
				{#if refAudio?.name}
					<span class="omnivoice-file-name">{refAudio.name}</span>
				{/if}
			</div>
		</div>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-name">{t('settings.omnivoice.voiceName')}</label>
			<input type="text" id="clone-name" class="api-key-input" placeholder={t('settings.omnivoice.cloneNamePh')} bind:value={name} />
		</div>

		<div class="omnivoice-modal-field">
			<label class="omnivoice-modal-label" for="clone-text">{t('settings.omnivoice.referenceText')}</label>
			<textarea id="clone-text" class="api-key-input omnivoice-clone-textarea" placeholder={t('settings.omnivoice.clonePromptPlaceholder')} rows="4" bind:value={refText}></textarea>
		</div>

		{#if error}
			<p class="omnivoice-modal-error">{error}</p>
		{/if}

		<div class="omnivoice-modal-actions">
			<button class="btn btn-sm btn-secondary" onclick={onClose}>{t('common.cancel')}</button>
			<button class="btn btn-sm btn-primary" onclick={submit} disabled={loading}>
				{loading ? t('settings.omnivoice.cloning') : t('settings.omnivoice.cloneBtn')}
			</button>
		</div>
	</div>
 {/snippet}</Dialog.Content>
</Dialog.Portal>
</Dialog.Root>

<style>
	.clone-modal {
		--dialog-width: 480px;
		padding: 1.25rem;
	}

	.omnivoice-modal-title {
		margin: 0 0 1rem;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.omnivoice-modal-field {
		margin-bottom: 0.75rem;
	}

	.omnivoice-modal-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-tertiary);
		margin-bottom: 0.3rem;
	}

	.omnivoice-modal-error {
		color: var(--color-error);
		font-size: 0.8rem;
		margin: 0.25rem 0;
	}

	.omnivoice-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.omnivoice-clone-textarea {
		resize: vertical;
		min-height: 5em;
		width: 100%;
		font-family: inherit;
	}

	.omnivoice-file-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.omnivoice-file-name {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.omnivoice-hidden-input {
		display: none;
	}
</style>
