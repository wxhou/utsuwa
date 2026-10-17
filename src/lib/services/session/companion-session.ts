import { backfillEmbeddings, getEmbeddingBackfillStatus } from '$lib/engine/memory';
import { hydrateWorkingMemory, getWorkingMemory, onRemoteTurn } from '$lib/engine/memory-session';
import { initEmbeddingModel } from '$lib/services/embeddings';
import { createReminderFiredHandler } from '$lib/services/chat/reminder-chat';
import type { SendCompanionMessageOptions } from '$lib/services/chat/companion-chat';
import { chatStore } from '$lib/stores/chat.svelte';
import { reminderStore } from '$lib/stores/reminders.svelte';
import { debugEventsStore } from '$lib/stores/debug-events.svelte';
import { modulesStore } from '$lib/stores/modules.svelte';
import { getMemoryBudget } from '$lib/engine/memory-budget';
import type { EventDefinition } from '$lib/types/events';

interface CompanionSessionHooks {
	/** Sends a fired reminder back through the page's companion pipeline. */
	send: (content: string, options: SendCompanionMessageOptions) => void;
	onEvent: (event: EventDefinition) => void;
}

/**
 * Startup shared by the app and the overlay: memory, embeddings, developer
 * events and reminders. Call from onMount and return the cleanup.
 */
export function startCompanionSession({ send, onEvent }: CompanionSessionHooks): () => void {
	// Mirror what she'd actually remember into the chat window (in-memory
	// only). Guarded so a mid-session remount never wipes messages the user is
	// looking at. The injection path caps recent turns at the context-window
	// budget (10 when unset), so showing all cached turns would display
	// history she forgot.
	hydrateWorkingMemory()
		.then(() => {
			if (chatStore.messages.length > 0) return;
			const contextSize =
				(modulesStore.getModuleSettings('consciousness').contextSize as number | undefined) ||
				undefined;
			const turnLimit = contextSize ? getMemoryBudget(contextSize).workingMemoryTurns : 10;
			chatStore.hydrate(getWorkingMemory().turns.slice(-turnLimit));
		})
		.catch((e) => console.error('Failed to hydrate working memory:', e));

	// Facts saved before the embedding model loaded get their vectors now
	initEmbeddingModel()
		.then(async (ready) => {
			if (!ready) return;
			const status = await getEmbeddingBackfillStatus();
			if (status.withoutEmbeddings > 0) await backfillEmbeddings();
		})
		.catch((e) => console.error('Failed to initialize embedding model:', e));

	const stopDebugEvents = debugEventsStore.listen(onEvent);

	// The other window's turns show up here too, so app and overlay stay one conversation
	const stopRemoteTurns = onRemoteTurn((turn) =>
		chatStore.addRemoteMessage(
			turn.role,
			turn.content,
			turn.metadata?.proactive
				? {
						proactive: true,
						memoryId: turn.metadata.memoryId ?? 0,
						memoryContent: turn.metadata.memoryContent ?? ''
					}
				: undefined
		)
	);

	// Fired reminders go back through the companion pipeline so the model
	// decides how to react. The overlay polls too, so timers fire while the
	// main window is hidden.
	const unsubscribeReminder = reminderStore.addReminderFiredListener(
		createReminderFiredHandler(send)
	);
	reminderStore.startPolling();

	return () => {
		reminderStore.stopPolling();
		unsubscribeReminder();
		stopDebugEvents();
		stopRemoteTurns();
	};
}
