<script lang="ts">
	import { browser } from '$app/environment';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { displayStore, REVEAL_SPEED_MS } from '$lib/stores/display.svelte';
	import { Icon, ShimmerLabel } from '$lib/components/ui';
	import { renderMarkdown } from './render-markdown';
	import { wrapWordsInHtml } from './reveal-markup';
	import { phaseLabelKey, type ThinkingPhase } from '$lib/services/chat/chat-phase';
	import { t } from '$lib/i18n';
	import { type PreparedImage } from '$lib/services/storage/keepsakes';
	import { chatDraftStore } from '$lib/stores/chat-draft.svelte';
	import { deleteAllTurns } from '$lib/services/storage/memory';
	import { resetWorkingMemoryTurns } from '$lib/engine/memory-session';
	import ChatInput from './ChatInput.svelte';
	import CopyButton from '$lib/components/ui/CopyButton.svelte';
	import { modulesStore } from '$lib/stores/modules.svelte';
	import { checkinFocus } from '$lib/services/modules/messaging/proactive-bridge';
	import { localPath } from '$lib/config/links';

	interface Props {
		open: boolean;
		isTyping?: boolean;
		phase?: ThinkingPhase;
		onSend: (content: string, images?: PreparedImage[]) => void;
		disabled?: boolean;
		visionCapable?: boolean;
	}

	let {
		open,
		isTyping = false,
		phase = 'thinking',
		onSend,
		disabled = false,
		visionCapable = true
	}: Props = $props();

	let messagesEl: HTMLDivElement | null = $state(null);
	let scrollRaf: number | null = null;

	// Auto-scroll whenever messages change or typing state changes.
	// requestAnimationFrame collapses rapid streaming chunks into one smooth scroll.
	$effect(() => {
		const _msgs = chatStore.messages.length;
		const _typing = isTyping;
		if (open && messagesEl) {
			if (scrollRaf) cancelAnimationFrame(scrollRaf);
			scrollRaf = requestAnimationFrame(() => {
				scrollRaf = null;
				messagesEl!.scrollTop = messagesEl!.scrollHeight;
			});
		}
		return () => {
			if (scrollRaf) {
				cancelAnimationFrame(scrollRaf);
				scrollRaf = null;
			}
		};
	});

	// The last assistant message id, highlighted while typing and revealed word
	// by word when it lands. Keyed each blocks keep the DOM stable, so the
	// reveal animation plays once and never replays on open/close.
	const lastAssistantId = $derived(
		[...chatStore.messages].reverse().find((m) => m.role === 'assistant')?.id ?? null
	);

	// System messages are kept for LLM context but not shown in the visible history
	const visibleMessages = $derived(chatStore.messages.filter((m) => m.role !== 'system'));

	const revealCadenceMs = $derived(REVEAL_SPEED_MS[displayStore.textRevealSpeed]);

	async function handleClearHistory() {
		if (!browser) return;
		if (confirm(t('chat.clearConfirm'))) {
			chatStore.clearMessages();
			// Clear the persisted record too, or a reload would bring the history
			// right back. Persistence failures must not block the in-memory clear,
			// mirroring recordTurn's non-fatal persistence policy.
			resetWorkingMemoryTurns();
			try {
				await deleteAllTurns();
			} catch (e) {
				console.debug('Failed to delete persisted conversation turns:', e);
			}
		}
	}

	// Inline volume control, wired to the same speech.volume setting the TTS
	// settings page edits. The change lands on the next played sentence.
	let volumeOpen = $state(false);

	// Proactive check-ins: each message can show the memory behind it, and a
	// clicked notification deep-links here to open that card directly.
	const openCheckinCards = $state<Record<string, boolean>>({});
	let focusRequestId = -1;
	$effect(() => {
		const focus = $checkinFocus;
		if (!focus || focus.requestId === focusRequestId) return;
		focusRequestId = focus.requestId;
		const target = [...chatStore.messages]
			.reverse()
			.find((m) => m.proactive && m.memoryId === focus.memoryId);
		if (!target) return;
		openCheckinCards[target.id] = true;
		messagesEl
			?.querySelector(`[data-message-id="${target.id}"]`)
			?.scrollIntoView({ block: 'center' });
	});
	function toggleCheckinCard(id: string) {
		openCheckinCards[id] = !openCheckinCards[id];
	}
	const ttsVolume = $derived(
		(modulesStore.getModuleSettings('speech').volume as number | undefined) ?? 1
	);
	function setVolume(value: number) {
		modulesStore.setModuleSetting('speech', 'volume', Number.isFinite(value) ? value : 1);
	}
</script>

<div
	class="chat-window docked"
	inert={!open}
	aria-hidden={!open}
	aria-label={t('chat.chatWindow')}
	role="region"
	class:open
	class:pin-left={displayStore.sidebarPosition === 'left'}
>
	<div class="window-header">
		<span class="chat-title">{t('chat.conversationTitle')}</span>
		<button
			class="clear-btn"
			onclick={handleClearHistory}
			aria-label={t('chat.clearHistory')}
			title={t('chat.clearHistory')}
			disabled={visibleMessages.length === 0}
		>
			<Icon name="trash" size={14} />
		</button>
		<div class="volume-wrap">
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="volume-anchor" onclick={(e) => e.stopPropagation()}>
				<button
					class="clear-btn volume-btn"
					class:volume-btn-active={volumeOpen}
					onclick={() => (volumeOpen = !volumeOpen)}
					aria-label={t('chat.volumeLabel')}
					title={t('chat.volumeLabel')}
				>
					<Icon name="volume-2" size={14} />
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
		<button
			class="clear-btn"
			onclick={() => displayStore.setChatDisplayMode('bubble')}
			aria-label={t('chat.collapseToBubble')}
			title={t('chat.collapseToBubble')}
		>
			<Icon name="message" size={14} />
		</button>
	</div>

	<div class="messages" bind:this={messagesEl}>
		{#if visibleMessages.length === 0 && !isTyping}
			<p class="empty-hint">{t('chat.emptyChat')}</p>
		{:else}
			{#each visibleMessages as msg (msg.id)}
				{@const isLastAssistant = msg.id === lastAssistantId}
				<!-- While she's typing, the shimmer bubble below stands in for the
				     streaming message; rendering partial content would restart the
				     reveal animation on every delta -->
				{#if !(isLastAssistant && isTyping)}
					<div
						class="message"
						class:user={msg.role === 'user'}
						class:assistant={msg.role === 'assistant'}
						data-message-id={msg.id}
					>
						<div class="bubble">
							{#if msg.proactive}
								<button
									type="button"
									class="proactive-badge"
									aria-expanded={!!openCheckinCards[msg.id]}
									onclick={() => toggleCheckinCard(msg.id)}
								>
									<Icon name="heart" size={11} />
									{t('proactive.badge')}
								</button>
								{#if msg.systemNotifyFailed}
									<span class="notify-failed">{t('proactive.systemNotifyFailed')}</span>
								{/if}
								{#if openCheckinCards[msg.id] && msg.memoryId !== undefined}
									<div class="proactive-memory-card">
										<span class="proactive-memory-label">{t('proactive.because')}</span>
										<p>{msg.memoryContent}</p>
										<a href={localPath('app', '/settings/memory')}>{t('proactive.openMemory')}</a>
									</div>
								{/if}
							{/if}
							{#if isLastAssistant && revealCadenceMs > 0 && msg.content}
								<p style="--reveal-cadence: {revealCadenceMs}ms">
									{@html wrapWordsInHtml(renderMarkdown(msg.content)).html}
								</p>
							{:else}
								<p>{@html renderMarkdown(msg.content)}</p>
							{/if}
						</div>
						{#if msg.content}<CopyButton text={msg.content} label={t('chat.copyMessage')} />{/if}
					</div>
				{/if}
			{/each}
			{#if isTyping}
				<div class="message assistant">
					<div class="bubble thinking">
						<ShimmerLabel label={t(phaseLabelKey(phase))} />
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<div class="input-dock">
		<ChatInput {onSend} {disabled} {visionCapable} />
	</div>

	{#if open && chatDraftStore.dropActive}
		<div class="drop-overlay">
			<Icon name="camera" size={22} />
			<span>{t('chat.dropPhoto')}</span>
		</div>
	{/if}
</div>

<style>
	.proactive-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		margin: 0 0 6px;
		padding: 2px 10px;
		border: 1px solid var(--border-subtle);
		border-radius: 999px;
		background: var(--bg-secondary);
		color: var(--text-secondary);
		font-size: 11px;
		line-height: 1.6;
		cursor: pointer;
	}
	.notify-failed {
		display: inline-flex;
		align-items: center;
		margin: 0 0 6px 6px;
		padding: 2px 8px;
		border: 1px dashed var(--border-subtle);
		border-radius: 999px;
		color: var(--text-tertiary);
		font-size: 11px;
		line-height: 1.6;
	}
	.proactive-memory-card {
		margin: 6px 0 10px;
		padding: 10px 12px;
		border: 1px dashed var(--border-subtle);
		border-radius: var(--radius-lg);
		background: var(--bg-secondary);
		font-size: 12px;
	}
	.proactive-memory-label {
		display: block;
		margin-bottom: 4px;
		color: var(--text-secondary);
		font-size: 11px;
	}
	.proactive-memory-card p { margin: 0 0 8px; color: var(--text-primary); }
	.proactive-memory-card a { font-size: 12px; }

	.chat-title { flex: 1; font-size: 13px; font-weight: 500; color: var(--text-secondary); }
	.chat-window {
		position: absolute;
		display: flex;
		flex-direction: column;
		background: var(--bg-page);
		backdrop-filter: none;
		-webkit-backdrop-filter: none;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-lg);
		z-index: 45;
		pointer-events: none;
		opacity: 0;
		transform: translateY(6px) scale(0.985);
		transition:
			opacity 0.22s ease,
			transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
		overflow: hidden;
		min-width: 0;
		min-height: 0;
	}

	.chat-window.open {
		opacity: 1;
		transform: translateY(0) scale(1);
		pointer-events: auto;
	}

	.window-header {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.5rem 0.625rem;
		flex-shrink: 0;
		user-select: none;
		-webkit-user-select: none;
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: transparent;
		border: none;
		border-radius: var(--control-radius, var(--radius-md));
		color: var(--text-tertiary);
		cursor: pointer;
	}
	.clear-btn:hover:not(:disabled) {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}
	.clear-btn:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.clear-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.clear-btn:hover:disabled {
		background: transparent;
		color: var(--text-tertiary);
	}

	.volume-wrap {
		margin-left: auto;
		display: flex;
		align-items: center;
	}

	.volume-anchor {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.volume-btn-active {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	.volume-slider {
		width: 88px;
		accent-color: var(--accent);
	}

	.messages {
		flex: 1;
		overflow-y: auto;
		padding: 0.875rem;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.message {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.125rem;
	}

	.message.user {
		align-items: flex-end;
	}

	.message.assistant {
		justify-content: flex-start;
	}

	.bubble {
		max-width: 85%;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-lg);
		font-size: 0.875rem;
		line-height: 1.6;
		overflow-wrap: anywhere;
		user-select: text;
		-webkit-user-select: text;
	}

	.user .bubble {
		background: var(--t3-message-surface);
		color: var(--t3-message-foreground);
		border-bottom-right-radius: var(--radius-sm);
	}

	.user .bubble :global(::selection) {
		background: var(--text-primary);
		color: var(--bg-primary);
	}

	.assistant .bubble {
		background: var(--control-bg);
		color: var(--text-primary);
		border: 1px solid transparent;
		border-bottom-left-radius: var(--radius-sm);
	}

	.bubble.thinking {
		padding: 0.55rem 0.85rem;
	}

	.bubble p {
		margin: 0;
	}

	.bubble :global(strong) {
		font-weight: 600;
	}

	.bubble :global(em) {
		font-style: italic;
	}

	.bubble :global(code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--text-primary), transparent 92%);
	}

	/* Word-by-word reveal for the latest reply */
	.bubble :global(.reveal-word) {
		opacity: 0;
		animation: word-in 0.24s ease-out forwards;
		animation-delay: calc(var(--word-index) * var(--reveal-cadence, 60ms));
	}

	@keyframes word-in {
		to {
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bubble :global(.reveal-word) {
			animation: none;
			opacity: 1;
		}
	}

	.empty-hint {
		text-align: center;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		margin-top: 2rem;
	}

	.input-dock {
		flex-shrink: 0;
		padding: 0.75rem;
	}

	/* Drag-to-show target while the window owns the input */
	.drop-overlay {
		position: absolute;
		inset: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.55rem;
		border-radius: calc(var(--radius-xl) - 4px);
		background: var(--accent-subtle);
		border: 2px dashed var(--accent);
		color: var(--accent-text);
		font-size: 0.95rem;
		font-weight: 600;
		z-index: 4;
		pointer-events: none;
	}

	.drop-overlay :global(svg) {
		animation: dropIcon 0.9s ease-in-out infinite;
	}

	@keyframes dropIcon {
		0%,
		100% {
			transform: translateY(0) rotate(0deg);
		}
		50% {
			transform: translateY(-4px) rotate(-6deg);
		}
	}

	.chat-window.docked {
		position: absolute;
		top: 68px;
		right: 0;
		bottom: 0;
		width: var(--chat-dock-width);
		min-width: 0;
		min-height: 0;
		border-radius: var(--radius-xl) 0 0 0;
		box-shadow: none;
		background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
	}
	.chat-window.docked.pin-left {
		left: 0;
		right: auto;
		border-radius: 0 var(--radius-xl) 0 0;
	}
	.messages {
		min-height: 0;
		overscroll-behavior: contain;
	}
	@media (max-width: 720px) {
		.chat-window.docked,
		.chat-window.docked.pin-left {
			top: auto;
			left: 0;
			right: 0;
			width: 100%;
			height: var(--chat-dock-height);
			border-radius: var(--radius-xl) var(--radius-xl) 0 0;
			padding-bottom: env(safe-area-inset-bottom, 0px);
		}
	}
	@media (pointer: coarse) {
		.clear-btn {
			width: 44px;
			height: 44px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chat-window {
			transition: none;
		}
	}
</style>
