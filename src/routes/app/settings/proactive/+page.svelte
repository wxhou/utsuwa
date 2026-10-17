<script lang="ts">
	import ProactiveSettings from '$lib/components/settings/ProactiveSettings.svelte';
	import '../settings-page.css';
	import { t } from '$lib/i18n';
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.nav.proactive')}</h2>
		<p>{t('proactive.pageSubtitle')}</p>
	</header>

	<ProactiveSettings />
</div>