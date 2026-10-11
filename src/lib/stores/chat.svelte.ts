/** An image the user showed her, for display in the message (object URL + keepsake id). */
export interface ShownImage {
	id: string;
	url: string;
}

import { turnsToMessages } from './chat-hydrate';

export interface Message {
	id: string;
	role: 'user' | 'assistant' | 'system';
	content: string;
	timestamp: Date;
	images?: ShownImage[];
}

// Persisted conversation turn (subset of engine/memory's ConversationTurn that
// display needs) used to refill the window on mount.
export interface HydratableTurn {
	role: 'user' | 'assistant';
	content: string;
	createdAt: Date;
}

function createChatStore() {
	let messages = $state<Message[]>([]);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let errorTimeout: ReturnType<typeof setTimeout> | null = null;

	function addMessage(role: 'user' | 'assistant' | 'system', content: string, images?: ShownImage[]) {
		const message: Message = {
			id: crypto.randomUUID(),
			role,
			content,
			timestamp: new Date(),
			...(images?.length ? { images } : {})
		};
		messages = [...messages, message];
		return message;
	}

	function updateLastMessage(content: string) {
		const last = messages[messages.length - 1];
		if (last && last.role === 'assistant') {
			// Runs per streamed chunk: replace only the last element instead of
			// rebuilding the whole array on every token
			messages = [...messages.slice(0, -1), { ...last, content }];
		}
	}

	function setLoading(loading: boolean) {
		isLoading = loading;
	}

	function setError(err: string | null) {
		// Clear any existing timeout
		if (errorTimeout) {
			clearTimeout(errorTimeout);
			errorTimeout = null;
		}
		error = err;
		// Auto-dismiss after 5 seconds if error is set
		if (err) {
			errorTimeout = setTimeout(() => {
				error = null;
				errorTimeout = null;
			}, 5000);
		}
	}

	function clearMessages() {
		messages = [];
	}

	// Refill the window from persisted history on mount. Replaces the whole
	// list — the caller only invokes this when messages is empty, before any
	// user interaction, so it never races a streaming update.
	function hydrate(turns: HydratableTurn[]) {
		messages = turnsToMessages(turns);
	}

	return {
		get messages() {
			return messages;
		},
		get isLoading() {
			return isLoading;
		},
		get error() {
			return error;
		},
		addMessage,
		updateLastMessage,
		setLoading,
		setError,
		clearMessages,
		hydrate
	};
}

export const chatStore = createChatStore();
