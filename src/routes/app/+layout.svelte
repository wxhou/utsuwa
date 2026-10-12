<script lang="ts">
	import { SITE_URL } from '$lib/config/site';
	import ScreenWakeLock from '$lib/components/display/ScreenWakeLock.svelte';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import UpdateBanner from '$lib/components/updater/UpdateBanner.svelte';

	// Dev-only UI annotation tool: zero cost in production builds. Skipped under
	// the Playwright test server (its overlay intercepts pointer events and
	// breaks click-based tests) — detect by port, not navigator.webdriver:
	// the chrome-devtools MCP driver also sets webdriver and should see the tool.
	const testPort = (import.meta.env.VITE_TEST_PORT as string | undefined) ?? '5188';
	const devAnnotations =
		import.meta.env.DEV &&
		(typeof location === 'undefined' || location.port !== testPort);
	let AnnotationTool: typeof import('agent-ui-annotation/svelte').AgentUIAnnotation | null = $state(null);
	$effect(() => {
		if (!devAnnotations) return;
		import('agent-ui-annotation/svelte').then((m) => (AnnotationTool = m.AgentUIAnnotation));
	});

	let { children } = $props();
	let viewportHeight = $state<number>();
	onMount(() => {
		// Asks the browser not to evict saves under storage pressure (Safari drops
		// site data after a week without a visit otherwise)
		navigator.storage?.persist?.().then(
			(granted) => console.debug('[storage] persistent:', granted),
			() => {}
		);
		const viewport = window.visualViewport;
		const resize = () => { viewportHeight = viewport?.height ?? window.innerHeight; };
		resize();
		viewport?.addEventListener('resize', resize);
		window.addEventListener('resize', resize);
		return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); };
	});

	// Crossfade app-side navigations (app <-> settings) where supported.
	onNavigate((navigation) => {
		if (!document.startViewTransition) return;
		return new Promise((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
</script>

<svelte:head>
	<meta name="robots" content="noindex, nofollow" />
	<!-- Shared app links still get a proper card -->
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Utsuwa" />
	<meta property="og:description" content="Open-source AI companion with 3D VRM avatars, voice chat, and memory." />
	<meta property="og:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:image" content={`${SITE_URL}/brand-assets/og-image.jpg`} />
</svelte:head>

<div class="app" style:height={viewportHeight ? `${viewportHeight}px` : undefined}>
	<ScreenWakeLock />
	{@render children()}
	<UpdateBanner />
	{#if AnnotationTool}
		<AnnotationTool theme="auto" outputLevel="standard" />
	{/if}
</div>

<style>
	.app {
		height: 100dvh;
		width: 100vw;
		overflow: hidden;
	}
</style>
