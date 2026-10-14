// NOTE: plain .ts so the node test runner can import it without $app or runes.
// The priority chain decision lives here; stt.svelte.ts's $derived just reads it.

export interface SttChainState {
	/** Whether the user explicitly added the provider (SttSettings marks it). */
	isProviderAdded(providerId: string): boolean;
	/** Whether an API key is set for the provider. */
	hasApiKey(providerId: string): boolean;
}

export type OpenAiSttProviderId = 'local-stt' | 'siliconflow' | 'groq-stt' | 'openai-stt';

/**
 * Which OpenAI-compatible STT client the recorder should use, in priority
 * order: explicitly added providers (local URL, or a key Groq/SiliconFlow)
 * come before the generic openai-stt endpoint so a newer domestic key wins
 * when it is joined later and is not accidentally routed to api.openai.com.
 */
export function resolveActiveOpenAiStt(state: SttChainState): OpenAiSttProviderId | null {
	if (state.isProviderAdded('local-stt')) return 'local-stt';
	if (state.isProviderAdded('siliconflow')) return 'siliconflow';
	if (state.hasApiKey('groq-stt')) return 'groq-stt';
	if (state.hasApiKey('openai-stt')) return 'openai-stt';
	return null;
}
