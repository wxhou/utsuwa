<script lang="ts">
	import { t } from '$lib/i18n';
	import SttSettings from '$lib/components/settings/SttSettings.svelte';
	import '../settings-page.css';
</script>

<div class="page">
	<header class="page-header">
		<h2>{t('settings.nav.stt')}</h2>
		<p>{t('settings.stt.pageSubtitle')}</p>
	</header>

	<SttSettings />
</div>
