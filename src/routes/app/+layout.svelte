<script lang="ts">
	import ScreenWakeLock from '$lib/components/display/ScreenWakeLock.svelte';
	import { onMount } from 'svelte';
	import { onNavigate } from '$app/navigation';
	import UpdateBanner from '$lib/components/updater/UpdateBanner.svelte';

	// Dev-only UI annotation tool: zero cost in production builds. Skipped under
	// automated browsers (Playwright sets navigator.webdriver): its overlay
	// intercepts pointer events and breaks click-based tests.
	const devAnnotations =
		import.meta.env.DEV && (typeof navigator === 'undefined' || !navigator.webdriver);
	let AnnotationTool: typeof import('agent-ui-annotation/svelte').AgentUIAnnotation | null = $state(null);
	$effect(() => {
		if (!devAnnotations) return;
		import('agent-ui-annotation/svelte').then((m) => (AnnotationTool = m.AgentUIAnnotation));
	});

	let { children } = $props();
	let viewportHeight = $state<number>();
	onMount(() => {
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
