<script lang="ts">
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import AnimationRow from '$lib/components/settings/AnimationRow.svelte';
	import { Button, Icon } from '$lib/components/ui';
	import Select from '$lib/components/ui/Select.svelte';
	import { t, type DictKey } from '$lib/i18n';
	import { animationLibraryStore } from '$lib/stores/animation-library.svelte';
	import { BUILTIN_IDLES } from '$lib/stores/animation-library-parser';

	let fileInput = $state<HTMLInputElement>();
	let uploading = $state(false);
	// Either one of our own dictionary keys or a raw message from a thrown error.
	let uploadErrorKey = $state<DictKey | ''>('');
	let uploadErrorText = $state('');
	const uploadError = $derived(uploadErrorKey ? t(uploadErrorKey) : uploadErrorText);
	const customEntries = $derived(animationLibraryStore.entries.filter((e) => e.kind === 'custom'));
	const builtinEntries = $derived(animationLibraryStore.entries.filter((e) => e.kind === 'emote'));

	// Mirror what actually plays: an empty or all-deleted pool runs every built-in idle
	const candidates = $derived(animationLibraryStore.idleCandidates);
	const checkedIds = $derived.by(() => {
		const ids = animationLibraryStore.base.idlePool.filter((id) => candidates.some((c) => c.id === id));
		return ids.length > 0 ? ids : BUILTIN_IDLES.map((e) => e.id);
	});
	let keepOneHint = $state(false);

	function togglePool(id: string, input: HTMLInputElement) {
		const next = input.checked ? [...checkedIds, id] : checkedIds.filter((x) => x !== id);
		if (next.length === 0) {
			input.checked = true;
			keepOneHint = true;
			return;
		}
		keepOneHint = false;
		animationLibraryStore.setIdlePool(next);
	}

	const thinkingOptions = $derived([
		{ value: 'none', label: t('settings.animations.thinkingNone') },
		...[...candidates, ...builtinEntries].map((e) => ({ value: e.id, label: e.name }))
	]);
	const thinkingValue = $derived(
		thinkingOptions.some((o) => o.value === animationLibraryStore.base.thinkingId)
			? (animationLibraryStore.base.thinkingId ?? 'none')
			: 'none'
	);

	async function handleFile(input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploading = true;
		uploadErrorKey = '';
		uploadErrorText = '';
		try {
			await animationLibraryStore.addFromFile(file);
		} catch (e) {
			if (e instanceof Error) uploadErrorText = e.message;
			else uploadErrorKey = 'settings.animations.addFailed';
		} finally {
			uploading = false;
		}
	}
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.animations.title')}</h2>
		<p>{t('settings.animations.subtitle')}</p>
		<p>{t('settings.animations.playHint')}</p>
	</header>
	<SettingsSection title={t('settings.animations.baseBehavior')} description={t('settings.animations.baseBehaviorDesc')}>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label" id="idle-pool-label">{t('settings.animations.idlePool')}</span>
				<span class="setting-desc">{t('settings.animations.idlePoolDesc')}</span>
				{#if keepOneHint}<span class="setting-desc" role="status">{t('settings.animations.keepOne')}</span>{/if}
			</div>
			<div class="pool" role="group" aria-labelledby="idle-pool-label">
				{#each candidates as entry (entry.id)}
					<label class="pool-option">
						<input
							type="checkbox"
							checked={checkedIds.includes(entry.id)}
							onchange={(e) => togglePool(entry.id, e.currentTarget)}
						/>
						<span>{entry.name}</span>
					</label>
				{/each}
			</div>
		</div>
		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">{t('settings.animations.thinking')}</span>
				<span class="setting-desc">{t('settings.animations.thinkingDesc')}</span>
			</div>
			<Select
				class="thinking-select"
				label={t('settings.animations.thinkingAria')}
				value={thinkingValue}
				options={thinkingOptions}
				onchange={(value) => animationLibraryStore.setThinkingId(value === 'none' ? null : value)}
			/>
		</div>
	</SettingsSection>
	<SettingsSection title={t('settings.animations.yours')}>
		{#snippet actions()}
			<Button variant="secondary" size="sm" onclick={() => fileInput?.click()} disabled={uploading}>
				<Icon name="upload" size={14} />{uploading ? t('settings.animations.checking') : t('settings.animations.upload')}
			</Button>
			<input bind:this={fileInput} type="file" accept=".vrma" hidden onchange={(e) => handleFile(e.currentTarget)} />
		{/snippet}
		{#if uploadError}<p class="hint error" role="alert">{uploadError}</p>{/if}
		{#each customEntries as entry (entry.id)}
			<AnimationRow {entry} />
		{:else}
			<p class="hint">{t('settings.animations.emptyCustom')}</p>
		{/each}
	</SettingsSection>
	<SettingsSection title={t('settings.animations.builtin')}>
		{#each builtinEntries as entry (entry.id)}
			<AnimationRow {entry} />
		{/each}
	</SettingsSection>
</div>

<style>
	.hint { margin: 0; color: var(--text-secondary); }
	.hint.error { margin-bottom: 12px; color: var(--color-error); }
	.page :global(header .btn) { display: inline-flex; align-items: center; gap: 6px; }
	.pool { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px 16px; max-width: 420px; }
	.page :global(.thinking-select) { width: 240px; max-width: 100%; }
	.pool-option { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-primary); cursor: pointer; }
	@media (max-width: 640px) {
		.pool { justify-content: flex-start; max-width: none; }
		.page :global(.thinking-select) { width: 100%; }
	}
</style>
