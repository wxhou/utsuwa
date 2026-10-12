<script lang="ts">
	import Icon from './Icon.svelte';
	import { t } from '$lib/i18n';
	import { characterStore } from '$lib/stores/character.svelte';
	const character = $derived(characterStore.state);
	const mood = $derived(characterStore.moodInfo);
	const relationship = $derived([
		{ label: t('stats.affection'), value: characterStore.affectionPercent },
		{ label: t('stats.trust'), value: character.trust },
		{ label: t('stats.intimacy'), value: character.intimacy },
		{ label: t('stats.comfort'), value: character.comfort },
		{ label: t('stats.respect'), value: character.respect }
	]);
	const activity = $derived([
		{ label: t('stats.daysTogether'), value: character.daysKnown },
		{ label: t('stats.interactions'), value: character.totalInteractions },
		{ label: t('stats.dayStreak'), value: character.currentStreak },
		{ label: t('stats.bestStreak'), value: character.longestStreak }
	]);
</script>

{#snippet metric(label: string, value: number)}
	<div class="metric">
		<dt>{label}</dt>
		<div class="track" aria-hidden="true"><span style:width={`${Math.max(0, Math.min(100, value))}%`}></span></div>
		<dd>{Math.round(value)}%</dd>
	</div>
{/snippet}

<div class="companion-state-summary">
	<section aria-label={t('stats.characterSection')}>
		<h4>{t('stats.rightNow')}</h4>
		<div class="mood-summary">
			<span class="mood-symbol" style:color={mood.color}><Icon name={mood.icon} size={22} /></span>
			<div><strong>{t(mood.nameKey)}</strong><p>{t(mood.descriptionKey)}</p></div>
		</div>
		{#if character.mood.causes.length > 0}<p class="mood-cause">{character.mood.causes.at(-1)}</p>{/if}
		<dl>{@render metric(t('stats.energy'), character.energy)}{@render metric(t('stats.moodIntensity'), character.mood.intensity)}</dl>
	</section>
	{#if characterStore.appMode === 'dating_sim'}
		<section aria-label={t('stats.relationshipSection')}>
			<div class="section-heading"><h4>{t('stats.relationship')}</h4><span class="stage-name">{t(characterStore.stageInfo.nameKey)}</span></div>
			<p class="section-description">{t(characterStore.stageInfo.descriptionKey)}</p>
			<dl>{#each relationship as stat}{@render metric(stat.label, stat.value)}{/each}</dl>
		</section>
	{/if}
	<section aria-label={t('stats.activitySection')}>
		<h4>{t('stats.timeTogether')}</h4>
		<dl class="activity">{#each activity as stat}<div><dt>{stat.label}</dt><dd>{stat.value.toLocaleString()}</dd></div>{/each}</dl>
	</section>
</div>

<style>
	.companion-state-summary { min-width: 0; }
	section { padding: 16px 0; }
	section + section { border-top: 1px solid var(--border-light); }
	h4 { margin: 0; color: var(--text-secondary); font-size: 12px; font-weight: 500; }
	.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.stage-name { background: var(--control-bg); font-size: 12px; color: var(--text-primary); border: 1px solid var(--border-light); border-radius: 6px; padding: 2px 6px; }
	.section-description, .mood-cause { margin: 8px 0 12px; color: var(--text-secondary); font-size: 13px; line-height: 1.5; }
	.mood-summary { display: flex; align-items: center; gap: 12px; margin: 12px 0; }
	.mood-symbol { width: 40px; height: 40px; display: grid; place-items: center; border-radius: 8px; background: var(--bg-secondary); flex-shrink: 0; }
	.mood-summary strong { font-size: 15px; font-weight: 500; color: var(--text-primary); }
	.mood-summary p { margin: 3px 0 0; font-size: 13px; color: var(--text-secondary); line-height: 1.5; }
	dl { margin: 0; }
	.metric { display: grid; grid-template-columns: 100px minmax(0, 1fr) 36px; align-items: center; gap: 12px; padding: 6px 0; font-size: 13px; }
	dt { color: var(--text-secondary); }
	dd { margin: 0; color: var(--text-primary); font-variant-numeric: tabular-nums; }
	.metric dd { text-align: right; font-size: 12px; }
	.track { height: 4px; background: var(--bg-tertiary); border-radius: 4px; overflow: hidden; }
	.track span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
	.activity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 14px; }
	.activity dt { font-size: 12px; }
	.activity dd { margin-top: 4px; font-size: 18px; font-weight: 500; }
</style>
