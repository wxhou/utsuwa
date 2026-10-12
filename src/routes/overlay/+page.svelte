<script lang="ts">
	import ScreenWakeLock from '$lib/components/display/ScreenWakeLock.svelte';
	import WakeLockIndicator from '$lib/components/display/WakeLockIndicator.svelte';
	import VrmScene from '$lib/components/vrm/VrmScene.svelte';
	import { pop } from '$lib/utils/motion';
	import BottomChatBar from '$lib/components/chat/BottomChatBar.svelte';
	import McpConfirmDialog from '$lib/components/mcp/McpConfirmDialog.svelte';
	import SpeechBubble from '$lib/components/chat/SpeechBubble.svelte';
	import FloatingChatIcon from '$lib/components/overlay/FloatingChatIcon.svelte';
	import FloatingMicButton from '$lib/components/overlay/FloatingMicButton.svelte';
	import HotkeyHandler from '$lib/components/overlay/HotkeyHandler.svelte';
	import CompanionStats from '$lib/components/ui/CompanionStats.svelte';
	import { goto } from '$app/navigation';
	import { onMount, tick } from 'svelte';
	import CameraSettingsPanel from '$lib/components/ui/CameraSettingsPanel.svelte';
	import FloatingStatIndicators from '$lib/components/ui/FloatingStatIndicators.svelte';
	import { EventScene } from '$lib/components/events';
	import { Icon } from '$lib/components/ui';
	import Toasts from '$lib/components/ui/Toasts.svelte';
	import { vrmStore } from '$lib/stores/vrm.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { settingsStore } from '$lib/stores/settings.svelte';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { ttsStore } from '$lib/stores/tts.svelte';
	import { personaStore } from '$lib/stores/persona.svelte';
	import { overlayStore } from '$lib/stores/overlay.svelte';
	import { isTauri, startDragging } from '$lib/services/platform';
	import { sendCompanionMessage, type SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
	import { type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
	import { startCompanionSession } from '$lib/services/session/companion-session';
	import { createEventSession } from '$lib/services/session/event-session.svelte';
	import { findReplayableEvent } from '$lib/engine/events';
	import { t } from '$lib/i18n';

	let latestResponse = $state('');
	let isTyping = $state(false);
	let thinkingPhase = $state<ThinkingPhase>('thinking');
	const events = createEventSession();

	let showCamera = $state(false);
	let windowError = $state('');
	let positionLocked = $state(false);
	// Inline volume control on the rail; same speech.volume setting as the
	// chat dock and the TTS settings page. Takes effect on the next sentence.
	let volumeOpen = $state(false);
	const ttsVolume = $derived(
		(modulesStore.getModuleSettings('speech').volume as number | undefined) ?? 1
	);
	function setVolume(value: number) {
		modulesStore.setModuleSetting('speech', 'volume', Number.isFinite(value) ? value : 1);
	}

	const chatExpanded = $derived(overlayStore.chatExpanded);

	// --- Overlay window sizing & lock ---
	const SIZE_KEY = STORAGE_INVENTORY.localStorage.overlaySize;
	const LOCK_KEY = STORAGE_INVENTORY.localStorage.overlayLocked;

	// Restore lock preference and last window size
	$effect(() => {
		positionLocked = localStorage.getItem(LOCK_KEY) === 'true';
		if (!isTauri()) return;
		const saved = localStorage.getItem(SIZE_KEY);
		if (saved) {
			(async () => {
				try {
					const { w, h } = JSON.parse(saved);
					const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
					await getCurrentWindow().setSize(new LogicalSize(w, h));
				} catch (e) {
					console.error('Failed to restore overlay size:', e);
				}
			})();
		}
	});

	function toggleLock() {
		positionLocked = !positionLocked;
		localStorage.setItem(LOCK_KEY, String(positionLocked));
	}

	// Top-left corner-tab drag resize: the window stays anchored at its
	// bottom-right, so growing means moving the origin up/left while the size
	// increases. Pointer deltas are in logical px, same unit as Tauri's
	// Logical* types, so the math is direct.
	let resizing = false;
	let resizeStart = { x: 0, y: 0, w: 0, h: 0, wx: 0, wy: 0 };
	let lastRequested = { w: 0, h: 0, x: 0, y: 0 };
	let resizeRaf = 0;

	async function onResizeStart(e: PointerEvent) {
		if (!isTauri()) return;
		e.preventDefault();
		e.stopPropagation();
		// Capture so pointermove keeps firing when the cursor leaves the window
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		resizeStart = { x: e.screenX, y: e.screenY, w: window.innerWidth, h: window.innerHeight, wx: 0, wy: 0 };
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();
			const pos = await win.outerPosition();
			const scale = await win.scaleFactor();
			resizeStart.wx = pos.x / scale;
			resizeStart.wy = pos.y / scale;
			resizing = true;
		} catch (err) {
			console.error('Failed to start overlay resize:', err);
		}
	}

	function onResizeMove(e: PointerEvent) {
		if (!resizing) return;
		const w = Math.min(900, Math.max(280, resizeStart.w - (e.screenX - resizeStart.x)));
		const h = Math.min(1400, Math.max(380, resizeStart.h - (e.screenY - resizeStart.y)));
		// Re-derive the origin from the clamped size so the bottom-right corner
		// never drifts, even at the size limits
		lastRequested = {
			w,
			h,
			x: resizeStart.wx + (resizeStart.w - w),
			y: resizeStart.wy + (resizeStart.h - h)
		};
		// Coalesce to one window update per frame
		if (resizeRaf) return;
		resizeRaf = requestAnimationFrame(async () => {
			resizeRaf = 0;
			try {
				const { getCurrentWindow, LogicalSize, LogicalPosition } = await import(
					'@tauri-apps/api/window'
				);
				const win = getCurrentWindow();
				await win.setSize(new LogicalSize(lastRequested.w, lastRequested.h));
				await win.setPosition(new LogicalPosition(lastRequested.x, lastRequested.y));
			} catch (err) {
				console.error('Failed to resize overlay:', err);
			}
		});
	}

	function onResizeEnd() {
		if (!resizing) return;
		resizing = false;
		if (lastRequested.w > 0) {
			localStorage.setItem(SIZE_KEY, JSON.stringify({ w: lastRequested.w, h: lastRequested.h }));
		}
	}

	onMount(() =>
		startCompanionSession({
			send: (content, options) => handleSend(content, [], options),
			onEvent: events.open
		})
	);

	// Re-show an event abandoned in a previous session, once per session.
	$effect(() => {
		(async () => {
			try {
				const pending = await findReplayableEvent();
				if (pending) events.open(pending);
			} catch (e) {
				console.debug('Event replay check failed:', e);
			}
		})();
	});

	// Handle drag for Tauri window
	function handleDragStart(e: MouseEvent) {
		if (isTauri() && !positionLocked && !resizing) {
			startDragging();
		}
	}

	// Exit overlay and return to main window
	async function exitToMain(openSettings = false) {
		windowError = '';
		if (!isTauri()) { await goto(openSettings ? '/app/settings/persona?view=state' : '/app'); return; }
		try {
			const { getCurrentWindow, getAllWindows } = await import('@tauri-apps/api/window');

			const windows = await getAllWindows();
			const mainWindow = windows.find(w => w.label === 'main');

			if (!mainWindow) {
				// Main window was closed — don't hide overlay or user loses the app
				windowError = 'The main window is unavailable. Your companion is still here.';
				return;
			}

			await mainWindow.show();
			await mainWindow.setFocus();
			if (openSettings) await mainWindow.emitTo('main', 'utsuwa-open-character-settings');

			const overlay = getCurrentWindow();
			await overlay.hide();
		} catch (e) {
			windowError = 'Could not open the main window. Try again.';
			console.error('Failed to exit overlay:', e);
		}
	}


	// Send a message through the shared companion pipeline. The overlay collapses
	// its chat on send and has no image path.
	async function handleSend(
		content: string,
		images: PreparedImage[] = [],
		options?: SendCompanionMessageOptions
	) {
		await sendCompanionMessage(content, images, {
			setTyping: (v) => (isTyping = v),
			setLatestResponse: (v) => (latestResponse = v),
			setActiveEvent: events.open,
			setPhase: (p) => (thinkingPhase = p),
			beforeStream: () => overlayStore.setChatExpanded(false)
		}, options);
	}

	function handleBubbleHide() {
		latestResponse = '';
	}

	function handleCharacterClick() {
		overlayStore.activate();
	}
</script>

<svelte:window onkeydown={async event => {
	if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
	if ((event.target as HTMLElement).closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
	if (showCamera) { event.preventDefault(); showCamera = false; await tick(); document.querySelector<HTMLButtonElement>('[aria-label="Camera settings"]')?.focus(); }
	else if (chatExpanded) { event.preventDefault(); overlayStore.setChatExpanded(false); await tick(); document.querySelector<HTMLButtonElement>('[aria-label="Open chat"]')?.focus(); }
}} />
<ScreenWakeLock />
<McpConfirmDialog />
<div class="overlay-wake-status"><WakeLockIndicator /></div>
<div class="overlay-container">
	<!-- VRM Scene (fills the overlay) - locked to prevent rotation when dragging -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="scene-container" onmousedown={handleDragStart}>
		<VrmScene overlay={true} locked={true} />
	</div>

	<!-- Hover chrome: soft frame + corner resize tab -->
	<div class="overlay-frame"></div>
	{#if isTauri()}
		<div
			class="resize-tab"
			onpointerdown={onResizeStart}
			onpointermove={onResizeMove}
			onpointerup={onResizeEnd}
			onpointercancel={onResizeEnd}
			role="separator"
			aria-label="Resize overlay"
			title="Drag to resize"
		></div>
	{/if}

	<!-- Control rail (revealed on hover) -->
	<div class="overlay-rail">
		<button class="rail-btn" onclick={() => exitToMain()} aria-label="Exit to main app" title="Back to app">
			<Icon name="chevron-left" size={15} />
		</button>
		<button
			class="rail-btn"
			class:rail-btn-active={showCamera}
			onclick={() => (showCamera = !showCamera)}
			aria-label="Camera settings" aria-expanded={showCamera}
			title="Camera"
		>
			<Icon name="video" size={15} />
		</button>
		<button
			class="rail-btn"
			class:rail-btn-active={positionLocked}
			onclick={toggleLock}
			aria-pressed={positionLocked}
			aria-label={positionLocked ? 'Unlock position' : 'Lock position'}
			title={positionLocked ? 'Position locked' : 'Lock position'}
		>
			<Icon name={positionLocked ? 'lock' : 'lock-open'} size={15} />
		</button>
		<!-- Volume: same speech.volume setting as the chat dock and settings page -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="volume-anchor" onclick={(e) => e.stopPropagation()}>
			<button
				class="rail-btn"
				class:rail-btn-active={volumeOpen}
				onclick={() => (volumeOpen = !volumeOpen)}
				aria-label={t('chat.volumeLabel')}
				title={t('chat.volumeLabel')}
			>
				<Icon name="volume-2" size={15} />
			</button>
			{#if volumeOpen}
				<input
					type="range"
					class="volume-slider"
					min="0"
					max="2"
					step="0.1"
					value={ttsVolume}
					oninput={(e) => setVolume(e.currentTarget.valueAsNumber)}
				/>
			{/if}
		</div>
	</div>

	{#if showCamera}
		<div class="overlay-camera-anchor">
			<CameraSettingsPanel profile="overlay" onclose={() => (showCamera = false)} />
		</div>
	{/if}

	<!-- Speech Bubble: docked as a dialog box — the window moves around, so a
	     head-tracking bubble is unreadable in overlay mode -->
	<SpeechBubble
		message={latestResponse}
		isTyping={isTyping}
		phase={thinkingPhase}
		onHide={handleBubbleHide}
		docked
	/>

	<!-- Floating stat change indicators -->
	<FloatingStatIndicators />

	<!-- Bottom controls (status + mic + chat icon) -->
	<div class="chat-controls">
		<CompanionStats onOpenSettings={() => exitToMain(true)} />
		{#if !chatExpanded}
			<FloatingMicButton onTranscript={handleSend} />
		{/if}
		<FloatingChatIcon />
	</div>

	<!-- Expandable Chat Bar -->
	{#if chatExpanded}
		<div class="chat-bar-container" out:pop={{ base: 'translateX(-50%)', y: 10, duration: 180 }}>
			<BottomChatBar onSend={handleSend} disabled={chatStore.isLoading} overlay />
		</div>
	{/if}

	{#if windowError}<div class="window-error" role="alert"><span>{windowError}</span><button class="btn btn-ghost btn-sm" aria-label="Dismiss window error" onclick={() => windowError = ''}><Icon name="x" size={14} /></button></div>{/if}
	<Toasts placement="bottom" />

	<!-- Event Scene Overlay -->
	{#if events.activeEvent?.scene}
		<EventScene
			scene={events.generatedScene ?? events.activeEvent.scene}
			pending={events.pending}
			eventName={events.activeEvent.name}
			eventType={events.activeEvent.type}
			companionName={personaStore.activeCard.name}
			overlay={true}
			onComplete={events.complete}
			onClose={events.close}
		/>
	{/if}

	<!-- Global hotkey handler (Tauri only) -->
	<HotkeyHandler onSendMessage={handleSend} />
</div>

<style>
	.overlay-container {
		position: relative;
		width: 100%;
		height: 100%;
		background: transparent;
	}

	.scene-container {
		position: absolute;
		inset: 0;
		cursor: grab;
	}

	.scene-container:active {
		cursor: grabbing;
	}

	/* A faint fill reveals the draggable window on hover. */
	.overlay-frame {
		position: fixed;
		inset: 5px;
		border-radius: 22px;
		pointer-events: none;
		z-index: 45;
		background: color-mix(in srgb, var(--bg-primary) 8%, transparent);
		box-shadow: var(--shadow-md);
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.overlay-container:hover .overlay-frame {
		opacity: 1;
	}

	/* Corner grab tab for resizing (top-left; the rail owns the top-right) */
	.resize-tab {
		position: fixed;
		left: 8px;
		top: 8px;
		width: 26px;
		height: 26px;
		z-index: 55;
		cursor: nwse-resize;
		touch-action: none;
		border-radius: 16px 4px 8px 4px;
		background: color-mix(in srgb, var(--bg-tertiary) 65%, transparent);
		box-shadow: var(--shadow-sm);
		opacity: 0;
		transition: opacity 0.2s ease, background 0.15s ease;
	}

	.resize-tab::before {
		content: '';
		position: absolute;
		left: 6px;
		top: 6px;
		width: 10px;
		height: 10px;
		border-left: 2px solid var(--text-secondary);
		border-top: 2px solid var(--text-secondary);
		border-radius: 3px 0 0 0;
	}

	.overlay-container:hover .resize-tab {
		opacity: 0.75;
	}

	.resize-tab:hover {
		opacity: 1;
		background: var(--bg-tertiary);
	}

	/* Control rail: exit / camera / lock, revealed on hover */
	.overlay-rail {
		position: fixed;
		top: 0.875rem;
		right: 0.875rem;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.rail-btn {
		width: 32px;
		height: 32px;
		border: 1px solid transparent;
		border-radius: 8px;
		background: var(--control-bg);
		color: var(--text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: var(--shadow-sm);
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease,
			box-shadow 0.15s ease, transform 0.15s ease;
	}

	/* Volume sits inline in the rail (button + slider side by side) so the
	   slider never reflows the tool column. */
	.volume-anchor {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.volume-anchor .rail-btn {
		flex-shrink: 0;
	}
	.volume-slider {
		width: 88px;
		accent-color: var(--accent);
	}

	.overlay-container:hover .rail-btn,
	.overlay-rail:focus-within .rail-btn,
	.rail-btn:focus-visible {
		opacity: 1;
		pointer-events: auto;
	}

	.rail-btn:hover {
		opacity: 1;
		color: var(--text-primary);
		background: color-mix(in srgb, var(--bg-tertiary), var(--text-primary) 8%);
		box-shadow: var(--shadow-md);
		transform: none;
	}

	/* Active states (camera panel open, position locked) stay visible */
	.rail-btn-active,
	.overlay-container:hover .rail-btn-active {
		opacity: 1;
		pointer-events: auto;
		color: var(--accent);
	}

	.overlay-camera-anchor {
		position: fixed;
		top: 0.875rem;
		right: 3.5rem;
		z-index: 60;
	}

	.chat-controls {
		position: absolute;
		bottom: 1.5rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 40;
		display: flex;
		gap: 8px;
		align-items: center;
		max-width: calc(100% - 24px);
		padding: 6px;
		border: 1px solid var(--border-light);
		border-radius: 12px;
		background: var(--control-bg);
		box-shadow: var(--shadow-md);
	}

	.chat-bar-container {
		position: fixed;
		bottom: 5rem;
		left: 50%;
		transform: translateX(-50%);
		width: 100%;
		max-width: 400px;
		padding: 0 1rem;
		z-index: 35;
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.overlay-wake-status { position: fixed; top: 48px; right: 12px; z-index: 70; }
	.window-error { position: fixed; top: 12px; left: 12px; right: 64px; padding: 10px; display: flex; align-items: center; gap: 8px; background: var(--control-bg); border: 1px solid var(--color-error); color: var(--text-primary); border-radius: 8px; font-size: 13px; z-index: 100; }
	@media (hover: none), (pointer: coarse) { .rail-btn { opacity: 1; pointer-events: auto; width: 44px; height: 44px; } .overlay-camera-anchor { right: 68px; } }
	@media (prefers-reduced-motion: reduce) { .rail-btn, .overlay-frame, .resize-tab { transition: none; } .chat-bar-container { animation: none; } }
</style>
