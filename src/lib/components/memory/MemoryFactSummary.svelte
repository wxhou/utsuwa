<script lang="ts">
	import type { Fact } from '$lib/types/memory';
	import { t, type DictKey } from '$lib/i18n';
	let {
		fact
	}: {
		fact: Pick<Fact, 'content' | 'category' | 'importance'> & Partial<Pick<Fact, 'confidence'>>;
	} = $props();
	const labels: Record<'user' | 'relationship' | 'shared_experience', DictKey> = {
		user: 'memory.catUser',
		relationship: 'memory.catRelationship',
		shared_experience: 'memory.catShared'
	};
</script>

<p class="fact-content">{fact.content}</p>
<p class="metadata">
	{t(labels[fact.category])} · {t('memory.importance')} {fact.importance}{#if fact.confidence !== undefined}
		· {t('memory.confidence')} {Math.round(fact.confidence * 100)}%{/if}
</p>

<style>
	.fact-content {
		margin: 0 0 0.5rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.metadata {
		margin: 0.5rem 0;
		color: var(--text-secondary);
		font-size: 0.75rem;
	}
</style>
