import type { HydratableTurn, Message } from './chat.svelte.ts';

// Pure mapping used by chatStore.hydrate: persisted conversation turns become
// display messages with fresh ids. Extracted so node --test can cover it
// without rune-file instantiation.
export function turnsToMessages(turns: HydratableTurn[]): Message[] {
	return turns.map((turn) => ({
		id: crypto.randomUUID(),
		role: turn.role,
		content: turn.content,
		timestamp: new Date(turn.createdAt),
		...(turn.metadata?.proactive
			? {
					proactive: true,
					memoryId: turn.metadata.memoryId,
					memoryContent: turn.metadata.memoryContent,
					...(turn.metadata.systemNotifyFailed ? { systemNotifyFailed: true } : {})
				}
			: {})
	}));
}