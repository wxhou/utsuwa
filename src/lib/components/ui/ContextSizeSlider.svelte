<script lang="ts">
	import Switch from './Switch.svelte';
	import { t } from '$lib/i18n';
	import '../settings/settings-controls.css';
	import {
		CONTEXT_SIZE_STEPS,
		DEFAULT_CONTEXT_SIZE,
		formatContextSize,
		snapContextSize
	} from '$lib/utils/context-window';

	interface Props {
		contextSize: number | undefined;
		onChange: (value: number | undefined) => void;
		id?: string;
	}

	let { contextSize, onChange, id = 'llm-context-size-toggle' }: Props = $props();

	const enabled = $derived(contextSize !== undefined && contextSize > 0);

	function handleToggle() {
		onChange(enabled ? undefined : DEFAULT_CONTEXT_SIZE);
	}

	function handleSliderInput(e: Event) {
		const index = Number((e.target as HTMLInputElement).value);
		onChange(CONTEXT_SIZE_STEPS[index]);
	}
</script>

<div class="context-size-row">
	<label class="context-size-label" for={id}>
		{t('settings.llm.contextWindow')}
		{#if enabled}
			<span class="context-size-value">{formatContextSize(snapContextSize(contextSize as number))}</span>
		{:else}
			<span class="context-size-value">{t('settings.llm.contextDefault')}</span>
		{/if}
	</label>
	<Switch {id} checked={enabled} onchange={handleToggle} label={t('settings.llm.contextScaling')} />
</div>
{#if enabled}
	<div class="context-size-slider-row">
		<input
			type="range"
			class="settings-range" aria-label={t('llm.contextSize')}
			min="0"
			max={CONTEXT_SIZE_STEPS.length - 1}
			step="1"
			value={CONTEXT_SIZE_STEPS.indexOf(snapContextSize(contextSize as number))}
			oninput={handleSliderInput}
		/>
		<div class="context-size-ticks">
			{#each CONTEXT_SIZE_STEPS as step}
				<span>{formatContextSize(step)}</span>
			{/each}
		</div>
	</div>
{/if}
<p class="context-size-note">{t('settings.llm.contextScalingHint')}</p>

<style>
	.context-size-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
	}

	.context-size-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex: 1;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--text-secondary);
	}

	.context-size-value {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}






	.context-size-slider-row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}


	.context-size-ticks {
		display: flex;
		justify-content: space-between;
		font-size: 0.65rem;
		color: var(--text-tertiary);
		padding: 0 0.25rem;
	}

	.context-size-note {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}
</style>
