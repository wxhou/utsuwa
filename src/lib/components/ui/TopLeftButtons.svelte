<script lang="ts">
	import { Icon } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import { photomodeStore } from '$lib/stores/photomode.svelte';

	interface Props {
		onOpenMemoryGraph?: () => void;
		onBoardClick?: () => void;
	}

	let { onOpenMemoryGraph, onBoardClick }: Props = $props();
</script>

<div class="top-left-buttons">
	<button class="btn btn-secondary btn-icon" onclick={() => photomodeStore.enter()} aria-label={t('ui.openPhotoMode')}>
		<Icon name="camera" size={16} />
	</button>
	{#if onOpenMemoryGraph}
		<button class="btn btn-secondary btn-icon" onclick={onOpenMemoryGraph} aria-label={t('ui.openMemoryGraph')}>
			<Icon name="brain" size={16} />
		</button>
	{/if}
	{#if onBoardClick}
		<button class="btn btn-secondary btn-icon" onclick={(event) => { event.currentTarget.focus(); onBoardClick?.(); }} aria-label={t('ui.photoboard')} title={t('ui.photoboardHint')}>
			<Icon name="image" size={16} />
		</button>
	{/if}
</div>

<style>
	.top-left-buttons {
		position: fixed;
		top: 1rem;
		left: 1rem;
		z-index: 50;
		display: flex;
		gap: 0.5rem;
	}

</style>
