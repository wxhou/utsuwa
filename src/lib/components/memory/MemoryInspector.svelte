<script lang="ts">
	import { liveQuery } from 'dexie';
	import { db } from '$lib/db';
	import { memoryApi, getWorkingMemory } from '$lib/engine/memory';
	import { deleteFact } from '$lib/services/storage/memory';
	import { characterStore } from '$lib/stores/character.svelte';
	import type { Fact, FactCategory, SessionSummary, ConversationTurn } from '$lib/types/memory';
	import { Button } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import MemoryFactSummary from './MemoryFactSummary.svelte';
	import ParserTest from '$lib/components/memory/ParserTest.svelte';

	let {
		view,
		factId,
		onShowAll,
		content = $bindable(''),
		newCategory = $bindable<FactCategory>('user'),
		importance = $bindable(50),
		busy = $bindable(false)
	}: {
		view: 'facts' | 'session' | 'sessions' | 'state' | 'test';
		factId?: number;
		onShowAll?: () => void;
		content?: string;
		newCategory?: FactCategory;
		importance?: number;
		busy?: boolean;
	} = $props();
	const tab = $derived(view);
	const categories: { value: FactCategory; label: string }[] = [
		{ value: 'user', label: t('memory.catUser') },
		{ value: 'relationship', label: t('stats.relationship') },
		{ value: 'shared_experience', label: t('memory.catShared') }
	];
	const PAGE_SIZE = 25;
	let query = $state('');
	let category = $state('all');
	let pageIndex = $state(0);
	let facts = $state<Fact[]>([]);
	let sessions = $state<SessionSummary[]>([]);
	let turns = $state<ConversationTurn[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let loadError = $state('');
	let retry = $state(0);
	let confirmId = $state<number>();
	let notice = $state('');
	let actionError = $state('');
	const charState = $derived(characterStore.state);

	$effect(() => {
		void tab;
		void factId;
		void query;
		void category;
		pageIndex = 0;
		confirmId = undefined;
	});
	$effect(() => {
		const selectedId = factId;
		const selected = tab,
			search = query.trim().toLocaleLowerCase(),
			filter = category,
			offset = pageIndex * PAGE_SIZE;
		void retry;
		if (selected === 'state' || selected === 'test') return;
		loading = true;
		loadError = '';
		const subscription = liveQuery(async () => {
			if (selected === 'facts') {
				const collection = db.facts
					.orderBy('createdAt')
					.reverse()
					.filter(
						(fact) =>
							(selectedId === undefined || fact.id === selectedId) &&
							(filter === 'all' || fact.category === filter) &&
							fact.content.toLocaleLowerCase().includes(search)
					);
				return {
					facts: await collection.clone().offset(offset).limit(PAGE_SIZE).toArray(),
					total: await collection.count()
				};
			}
			if (selected === 'sessions') {
				return {
					sessions: await db.sessions
						.orderBy('startedAt')
						.reverse()
						.offset(offset)
						.limit(PAGE_SIZE)
						.toArray(),
					total: await db.sessions.count()
				};
			}
			const activeId =
				getWorkingMemory().currentSessionId ??
				(await db.sessions.orderBy('startedAt').reverse().first())?.id;
			if (activeId === undefined) return { turns: [], total: 0 };
			const collection = db.conversationTurns.where('sessionId').equals(activeId);
			return {
				turns: await collection.clone().offset(offset).limit(PAGE_SIZE).toArray(),
				total: await collection.count()
			};
		}).subscribe({
			next: (data) => {
				facts = 'facts' in data ? (data.facts ?? []) : [];
				sessions = 'sessions' in data ? (data.sessions ?? []) : [];
				turns = 'turns' in data ? (data.turns ?? []) : [];
				total = data.total;
				loading = false;
				if (offset >= total && pageIndex > 0)
					pageIndex = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
			},
			error: () => {
				loadError = t('memory.loadFailed');
				loading = false;
			}
		});
		return () => subscription.unsubscribe();
	});

	async function addMemory(event: SubmitEvent) {
		event.preventDefault();
		const text = content.trim();
		if (!text || busy || text.length > 2000) return;
		busy = true;
		notice = '';
		actionError = '';
		try {
			await memoryApi.createFact({
				content: text,
				category: newCategory,
				importance,
				confidence: 1,
				source: 'manual'
			});
			content = '';
			pageIndex = 0;
			query = '';
			category = 'all';
			notice = t('memory.savedNotice');
			if (factId !== undefined) onShowAll?.();
		} catch {
			actionError = t('memory.saveFailed');
		} finally {
			busy = false;
		}
	}
	async function removeMemory(id: number) {
		if (busy) return;
		busy = true;
		notice = '';
		actionError = '';
		try {
			await deleteFact(id);
			confirmId = undefined;
			notice = t('memory.memoryDeleted');
		} catch {
			actionError = t('memory.deleteFailed');
		} finally {
			busy = false;
		}
	}
	function date(value: Date | undefined) {
		return value ? new Date(value).toLocaleString() : t('memory.notRecorded');
	}
</script>

<div class="memory-inspector">
	{#if factId !== undefined && view === 'facts'}<div class="selection-notice">
			<span>{t('memory.fromGraph')}</span><Button variant="secondary" size="sm" onclick={onShowAll}
				>{t('memory.showAllFacts')}</Button
			>
		</div>{/if}
	{#if view === 'facts'}
		<SettingsSection
			title={t('memory.rememberedFacts')}
			description={t('memory.factsDesc')}
		>
			<div class="filters">
				<label
					>{t('memory.searchMemories')}<input
						class="settings-field"
						type="search"
						bind:value={query}
						placeholder={t('memory.searchPlaceholder')}
					/></label
				>
				<label
					>{t('memory.category')}<select class="settings-field" bind:value={category}
						><option value="all">{t('memory.allCategories')}</option>{#each categories as c}<option
								value={c.value}>{c.label}</option
							>{/each}</select
					></label
				>
			</div>
			{#if !loading && !loadError && facts.length === 0}<p class="empty">
					{query || category !== 'all'
						? t('memory.noMatchFilters')
						: factId !== undefined
							? t('memory.memoryGone')
							: t('memory.noFactsYet')}
				</p>{/if}
			<ul class="records">
				{#each facts as fact (fact.id)}
					<li>
						<MemoryFactSummary {fact} />
						<div class="record-footer">
							<time>{date(fact.createdAt)}</time>
							{#if confirmId === fact.id}
								<div class="confirm" role="group" aria-label={t('memory.confirmDeletion')}>
									<span>{t('memory.deleteConfirm')}</span><Button
										size="sm"
										variant="secondary"
										disabled={busy}
										onclick={() => (confirmId = undefined)}>{t('common.cancel')}</Button
									><Button
										size="sm"
										variant="danger"
										disabled={busy}
										onclick={() => removeMemory(fact.id!)}>{t('memory.deleteMemory')}</Button
									>
								</div>
							{:else}<Button
									size="sm"
									variant="ghost"
									disabled={busy}
									onclick={() => (confirmId = fact.id)}>{t('common.delete')}</Button
								>{/if}
						</div>
					</li>
				{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'session'}
		<SettingsSection
			title={t('memory.currentSession')}
			description={t('memory.currentSessionHint')}
		>
			{#if !loading && !turns.length}<p class="empty">
					{t('memory.noSavedTurns')}
				</p>{/if}
			<ul class="records">
				{#each turns as turn (turn.id)}<li>
						<p class="metadata">
							{turn.role === 'user' ? t('memory.you') : characterStore.name} · {date(turn.createdAt)}
						</p>
						<p class="fact-content">{turn.content}</p>
					</li>{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'sessions'}
		<SettingsSection
			title={t('memory.savedSessions')}
			description={t('memory.savedSessionsHint')}
		>
			{#if !loading && !sessions.length}<p class="empty">{t('memory.noSessionsSaved')}</p>{/if}
			<ul class="records">
				{#each sessions as session (session.id)}<li>
						<h4>{date(session.startedAt)}</h4>
						<p class="fact-content">{session.summary || t('memory.noSummaryYet')}</p>
						<p class="metadata">
							{t('memory.messagesCount', { n: session.messageCount })} · {session.endedAt
								? t('memory.lastTurn', { date: date(session.endedAt) })
								: t('memory.noTurnsRecorded')}
						</p>
						{#if session.keyTopics.length}<p class="metadata">
								{t('memory.topics', { topics: session.keyTopics.join(', ') })}
							</p>{/if}{#if session.emotionalArc}<p>{session.emotionalArc}</p>{/if}
					</li>{/each}
			</ul>
		</SettingsSection>
	{:else if view === 'state'}
		<SettingsSection
			title={t('memory.characterState')}
			description={t('memory.stateHint')}
		>
			<dl>
				<dt>{t('memory.fieldName')}</dt>
				<dd>{charState.name}</dd>
				<dt>{t('memory.fieldMode')}</dt>
				<dd>{charState.appMode === 'companion' ? t('onboarding.companion') : t('onboarding.datingSim')}</dd>
				<dt>{t('memory.fieldMood')}</dt>
				<dd>{charState.mood.primary} · {charState.mood.intensity}%</dd>
				<dt>{t('memory.fieldStage')}</dt>
				<dd>{characterStore.stageInfo.name}</dd>
				<dt>{t('stats.energy')}</dt>
				<dd>{charState.energy}</dd>
				<dt>{t('memory.fieldConversations')}</dt>
				<dd>{charState.totalInteractions}</dd>
				{#if charState.appMode !== 'companion'}<dt>{t('stats.affection')}</dt>
					<dd>{charState.affection}</dd>
					<dt>{t('stats.trust')}</dt>
					<dd>{charState.trust}</dd>
					<dt>{t('stats.intimacy')}</dt>
					<dd>{charState.intimacy}</dd>
					<dt>{t('stats.comfort')}</dt>
					<dd>{charState.comfort}</dd>
					<dt>{t('stats.respect')}</dt>
					<dd>{charState.respect}</dd>{/if}
			</dl>
		</SettingsSection>
	{:else}<SettingsSection
			title={t('memory.responseParser')}
			description={t('memory.parserHint')}
			><ParserTest /></SettingsSection
		>{/if}
	{#if !['state', 'test'].includes(tab)}
		{#if loadError}<div role="alert" class="error">
				{loadError}
				<Button size="sm" variant="secondary" onclick={() => retry++}>{t('common.retry')}</Button>
			</div>
		{:else if loading}<p role="status">{t('memory.loadingMemories')}</p>
		{:else}<nav class="pagination" aria-label={t('memory.pages')}>
				<span
					>{tab === 'facts'
						? t('memory.unitFacts', { n: total })
						: tab === 'sessions'
							? t('memory.unitSessions', { n: total })
							: t('memory.unitTurns', { n: total })} · {t('memory.pageOf', {
						page: pageIndex + 1,
						total: Math.max(1, Math.ceil(total / PAGE_SIZE))
					})}</span
				><Button
					variant="secondary"
					size="sm"
					disabled={pageIndex === 0}
					onclick={() => pageIndex--}>{t('memory.prevPage')}</Button
				><Button
					variant="secondary"
					size="sm"
					disabled={(pageIndex + 1) * PAGE_SIZE >= total}
					onclick={() => pageIndex++}>{t('memory.nextPage')}</Button
				>
			</nav>{/if}
	{/if}
	{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	{#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
	{#if tab === 'facts'}
		<SettingsSection
			title={t('memory.addMemory')}
			description={t('memory.addMemoryDesc')}
		>
			<form onsubmit={addMemory}>
				<label
					>{t('memory.memoryLabel')}<textarea
						class="settings-field"
						bind:value={content}
						required
						maxlength={2000}
						rows={3}
						placeholder={t('memory.exampleFact')}
						disabled={busy}></textarea></label
				>
				<div class="filters">
					<label
						>{t('memory.memoryCategory')}<select class="settings-field" bind:value={newCategory} disabled={busy}
							>{#each categories as c}<option value={c.value}>{c.label}</option>{/each}</select
						></label
					><label
						>{t('memory.importance')} <span>{importance}</span><input
							class="settings-range"
							type="range"
							min={0}
							max={100}
							step={5}
							bind:value={importance}
							disabled={busy}
						/></label
					>
				</div>
				<Button type="submit" disabled={busy || !content.trim()}
					>{busy ? t('memory.saving') : t('memory.addMemoryButton')}</Button
				>
			</form>
		</SettingsSection>
	{/if}
</div>

<style>
	.memory-inspector {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding-bottom: 1rem;
	}
	.memory-inspector > :global(*) {
		flex-shrink: 0;
	}
	.selection-notice {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
	}
	.filters > label {
		flex: 1 1 200px;
		min-width: 0;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
		color: var(--text-secondary);
		font-size: 0.875rem;
		font-weight: 500;
	}
	input[type='range'] {
		width: 100%;
		accent-color: var(--accent);
		min-height: 32px;
	}
	.records {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.records li {
		padding: 1rem 0;
		border-bottom: 1px solid var(--border-subtle);
	}
	.records li:last-child {
		border-bottom: 0;
		padding-bottom: 0;
	}
	.records h4 {
		font-size: 0.875rem;
		margin: 0;
	}
	.fact-content {
		margin: 0 0 0.5rem;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.metadata,
	time {
		color: var(--text-secondary);
		font-size: 0.75rem;
	}
	.metadata {
		margin: 0.5rem 0;
	}
	.record-footer,
	.confirm,
	.pagination {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.record-footer {
		justify-content: space-between;
	}
	.confirm {
		font-size: 0.8125rem;
	}
	.pagination {
		font-size: 0.8125rem;
	}
	.pagination > span {
		flex: 1 1 180px;
	}
	.empty {
		color: var(--text-secondary);
		font-size: 0.875rem;
		padding: 1rem 0;
	}
	.notice {
		color: var(--text-primary);
	}
	.error {
		color: var(--color-error);
	}
	dl {
		display: grid;
		grid-template-columns: minmax(100px, 1fr) 2fr;
		gap: 0.75rem;
		font-size: 0.875rem;
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
