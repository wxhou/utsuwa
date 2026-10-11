import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import type { LLMProvider } from '$lib/types';
import { ensureOpenAIPath, getChatBaseUrl } from '$lib/services/providers/local-endpoints';
import { assertSafeProviderUrl } from '$lib/services/providers/url-guard';
import { sanitizeProviderError } from '$lib/services/providers/provider-errors';
import { DEFAULT_CHAT_BASE_URLS } from '$lib/services/providers/provider-defaults';

// Providers that don't require API keys — same set as /api/chat.
const LOCAL_PROVIDERS: LLMProvider[] = ['ollama', 'lmstudio'];

// Non-streaming proxy for the decoupled state/memory extraction call. Browsers
// can't reach most third-party APIs directly (no CORS headers), so the
// extraction fallback in client-chat.ts routes through here. Mirrors /api/chat's
// URL normalization and SSRF guard so the two proxies can't drift.
export const POST: RequestHandler = async ({ request }) => {
	const { provider, model, apiKey, baseURL, system, userMessage, reply } = await request.json();

	if (
		typeof model !== 'string' || !model ||
		typeof system !== 'string' ||
		typeof userMessage !== 'string' ||
		typeof reply !== 'string'
	) {
		return json({ error: 'model, system, userMessage and reply are required' }, 400);
	}

	const typedProvider = provider as LLMProvider;
	const isLocalProvider = LOCAL_PROVIDERS.includes(typedProvider);
	const isKeylessProvider = isLocalProvider || typedProvider === 'openai-compatible';
	if (!apiKey && !isKeylessProvider) {
		return json({ error: 'API key required' }, 400);
	}

	// Configure based on provider — same normalization as /api/chat.
	let providerBaseURL = baseURL;
	if (typedProvider === 'anthropic') {
		providerBaseURL = providerBaseURL || DEFAULT_CHAT_BASE_URLS.anthropic;
	} else if (isLocalProvider) {
		providerBaseURL = getChatBaseUrl(typedProvider, providerBaseURL);
	} else if (typedProvider === 'openai-compatible') {
		providerBaseURL = providerBaseURL ? ensureOpenAIPath(providerBaseURL) : providerBaseURL;
	} else {
		providerBaseURL = providerBaseURL || DEFAULT_CHAT_BASE_URLS[typedProvider];
	}

	// Block SSRF: the base URL is client-supplied and fetched server-side.
	try {
		assertSafeProviderUrl(providerBaseURL, env.ALLOW_LOCAL_PROVIDER_HOSTS === 'true');
	} catch (e) {
		return json({ error: e instanceof Error ? e.message : 'Invalid provider URL' }, 400);
	}

	const trimmedBase = String(providerBaseURL).replace(/\/+$/, '');
	const userContent = `User: ${userMessage}\nCompanion: ${reply}\n\nReturn the JSON.`;
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };

	let url: string;
	let body: string;
	if (typedProvider === 'anthropic') {
		headers['x-api-key'] = apiKey || '';
		headers['anthropic-version'] = '2023-06-01';
		url = `${trimmedBase}/messages`;
		body = JSON.stringify({
			model,
			max_tokens: 400,
			system,
			messages: [{ role: 'user', content: userContent }]
		});
	} else {
		if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
		url = `${trimmedBase}/chat/completions`;
		body = JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: userContent }
			],
			response_format: { type: 'json_object' },
			// DeepSeek v4 thinking models spend the token budget on reasoning and
			// can end with empty content (finish_reason=length); extraction wants a
			// direct answer. Other OpenAI-compatible providers ignore the field.
			...(typedProvider === 'deepseek' && { thinking: { type: 'disabled' } }),
			stream: false,
			max_tokens: 400
		});
	}

	try {
		const response = await fetch(url, { method: 'POST', headers, body });
		if (!response.ok) {
			const detail = (await response.text().catch(() => '')) || `Provider returned ${response.status}`;
			return json({ error: sanitizeProviderError(detail, providerBaseURL) }, 502);
		}
		const data = await response.json();
		const text = typedProvider === 'anthropic'
			? data?.content?.[0]?.text
			: data?.choices?.[0]?.message?.content;
		if (typeof text !== 'string') {
			return json({ error: 'Provider returned an unexpected response' }, 502);
		}
		return json({ text }, 200);
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Failed to reach provider';
		return json({ error: sanitizeProviderError(msg, providerBaseURL) }, 502);
	}
};

function json(data: unknown, status: number): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}