<script lang="ts">
	import { Button } from '$lib/components/ui';
	import { t, type DictKey } from '$lib/i18n';
	import { parseResponse, extractPotentialFacts } from '$lib/ai/response-parser';
	import { characterStore } from '$lib/stores/character.svelte';

	let message = $state('I enjoy hiking.');
	const firstSample =
		'That sounds fun!\n```json\n{"mood_change":{"emotion":"happy","intensity_delta":5},"new_memory":"The user enjoys hiking."}\n```';
	let response = $state(firstSample);
	// Either one of our own dictionary keys or the parsed output itself.
	let resultKey = $state<DictKey | ''>('');
	let resultText = $state('');
	const result = $derived(resultKey ? t(resultKey) : resultText);
	const samples = [
		{ label: t('memory.sampleMood'), text: firstSample },
		{ label: t('memory.sampleDialogue'), text: 'Tell me more about your day.' },
		{ label: t('memory.sampleMalformed'), text: 'Hello!\n```json\n{"mood_change":\n```' }
	];
	function parse() {
		try {
			const parsed = parseResponse(response, characterStore.name);
			resultKey = '';
			resultText = JSON.stringify(
				{ ...parsed, potentialFacts: extractPotentialFacts(parsed.dialogue, message) },
				null,
				2
			);
		} catch {
			resultText = '';
			resultKey = 'memory.parserParseFailed';
		}
	}
	function pickSample(text: string) {
		response = text;
		resultKey = '';
		resultText = '';
	}
</script>

<p class="hint">
	{t('memory.parserTryHint')}
</p>
<div class="samples">
	{#each samples as sample}<Button
			variant="secondary"
			size="sm"
			onclick={() => pickSample(sample.text)}>{sample.label}</Button
		>{/each}
</div>
<label
	>{t('memory.userMessage')}<textarea class="settings-field" bind:value={message} maxlength={2000} rows={2}
	></textarea></label
>
<label
	>{t('memory.rawResponse')}<textarea
		class="settings-field"
		bind:value={response}
		maxlength={20000}
		rows={7}></textarea></label
>
<Button onclick={parse}>{t('memory.parseSample')}</Button>
{#if result}<pre aria-label={t('memory.parserResult')}>{result}</pre>{/if}

<style>
	.hint {
		color: var(--text-secondary);
		font-size: 0.875rem;
	}
	.samples {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 1rem 0;
		font-size: 0.875rem;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		padding: 1rem;
		border-radius: var(--radius-lg);
		background: var(--bg-secondary);
		font-size: 0.8125rem;
	}
</style>
