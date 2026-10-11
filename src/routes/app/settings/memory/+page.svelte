<script lang="ts">
	import type { FactCategory } from '$lib/types/memory';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button, Icon } from '$lib/components/ui';
	import { t } from '$lib/i18n';
	import Tabs from '$lib/components/ui/Tabs.svelte';
	import SettingsSection from '$lib/components/settings/SettingsSection.svelte';
	import MemoryInspector from '$lib/components/memory/MemoryInspector.svelte';
	import MemoryGraph from '$lib/components/memory/MemoryGraph.svelte';
	import MemoryGraphModal from '$lib/components/memory/MemoryGraphModal.svelte';
	import { localPath } from '$lib/config/links';
	import '../settings-page.css';

	const tabs = [
		{ value: 'graph', label: t('settings.memory.tabGraph') },
		{ value: 'facts', label: t('settings.memory.tabFacts') },
		{ value: 'sessions', label: t('settings.memory.tabSessions') },
		{ value: 'settings', label: t('settings.memory.tabSettings') }
	];
	const tab = $derived(
		tabs.find((item) => item.value === page.url.searchParams.get('view'))?.value ?? 'graph'
	);
	const factId = $derived.by(() => {
		const value = page.url.searchParams.get('fact');
		return value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0
			? Number(value)
			: undefined;
	});
	let memoryDraft = $state('');
	let memoryBusy = $state(false);
	let memoryCategory = $state<FactCategory>('user');
	let memoryImportance = $state(50);
	let sessionView = $state('session');
	let advancedView = $state('state');
	let expanded = $state(false);
	let selectedId = $state<number | null>(null);
	let categories = $state<FactCategory[]>(['user', 'relationship', 'shared_experience']);

	function navigate(view: string, id?: number) {
		const url = new URL(page.url);
		url.searchParams.set('view', view);
		if (id !== undefined) url.searchParams.set('fact', String(id));
		else url.searchParams.delete('fact');
		void goto(url, { noScroll: true, keepFocus: true });
	}
	function inspectFact(id: number) {
		expanded = false;
		navigate('facts', id);
	}
</script>

<div class="page memory-page">
	<header class="page-header">
		<h2>{t('settings.nav.memory')}</h2>
		<p>{t('settings.memory.pageSubtitle')}</p>
	</header>
	<Tabs bind:value={() => tab, navigate} items={tabs} label="Memory views">
		{#snippet children(view)}
			{#if view === 'graph'}
				<div class="graph-heading">
					<p>{t('settings.memory.graphHint')}</p>
					<Button
						variant="secondary"
						size="sm"
						onclick={(event: MouseEvent) => {
							if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
							expanded = true;
						}}><Icon name="external-link" size={16} />{t('settings.memory.expandGraph')}</Button
					>
				</div>
				{#if !expanded}<MemoryGraph
						bind:selectedId
						bind:categories
						onInspect={inspectFact}
						onOpenFacts={() => navigate('facts')}
					/>{/if}
				<MemoryGraphModal
					bind:open={expanded}
					bind:categories
					bind:selectedId
					onInspect={inspectFact}
					onOpenFacts={() => {
						expanded = false;
						navigate('facts');
					}}
				/>
			{:else if view === 'facts'}
				<MemoryInspector
					view="facts"
					bind:content={memoryDraft}
					bind:busy={memoryBusy}
					bind:newCategory={memoryCategory}
					bind:importance={memoryImportance}
					{factId}
					onShowAll={() => navigate('facts')}
				/>
			{:else if view === 'sessions'}
				<Tabs
					bind:value={sessionView}
					items={[
						{ value: 'session', label: t('memory.current') },
						{ value: 'sessions', label: t('memory.saved') }
					]}
					label={t('memory.sessionViews')}
				>
					{#snippet children(session)}<MemoryInspector
							view={session === 'session' ? 'session' : 'sessions'}
						/>{/snippet}
				</Tabs>
			{:else}
				<SettingsSection
					title={t('settings.memory.storageTitle')}
					description={t('settings.memory.storageDesc')}
				>
					<p class="storage-copy">
						{t('settings.memory.storageCopy')}
					</p>
					<Button variant="secondary" href={localPath('app', '/settings/data')}
						>{t('settings.memory.dataSettings')}<Icon name="arrow-right" size={16} /></Button
					>
				</SettingsSection>
				<details class="advanced">
					<summary>{t('settings.memory.advanced')}</summary>
					<p>
						{t('settings.memory.advancedDesc')}
					</p>
					<Tabs
						bind:value={advancedView}
						items={[
							{ value: 'state', label: t('settings.memory.state') },
							{ value: 'test', label: t('settings.memory.parserTest') }
						]}
						label="Advanced memory tools"
					>
						{#snippet children(tool)}<MemoryInspector
								view={tool === 'state' ? 'state' : 'test'}
							/>{/snippet}
					</Tabs>
				</details>
			{/if}
		{/snippet}
	</Tabs>
</div>

<style>
	:global(.settings-layout) .memory-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 1200px;
		width: 100%;
		padding-bottom: 1rem;
	}
	.memory-page > :global(*) {
		flex-shrink: 0;
	}
	.page-header {
		margin-bottom: 0;
	}
	.graph-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}
	.graph-heading p {
		flex: 1 1 260px;
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-secondary);
	}
	.storage-copy,
	.advanced > p {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: 0 0 1rem;
	}
	.advanced {
		margin-top: 1rem;
	}
	summary {
		cursor: pointer;
		min-height: 44px;
		padding: 0.75rem 0;
		color: var(--text-primary);
		font-size: 0.875rem;
		font-weight: 600;
	}
	summary:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
