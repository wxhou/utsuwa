<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { onMount } from 'svelte';
	import { localPath } from '$lib/config/links';

	onMount(() => {
		goto(localPath('app', '/settings/persona'), { replaceState: true });
	});
</script>

<div class="redirect">
	<p>{t('common.loading')}</p>
</div>

<style>
	.redirect {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: var(--text-secondary);
	}
</style>
