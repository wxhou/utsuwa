import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveActiveOpenAiStt, type SttChainState } from './stt-chain.ts';

function chain(opts: { localAdded?: boolean; siliconflow?: 'added' | 'key' | 'both' | 'none'; groq?: boolean; openai?: boolean }): SttChainState {
	return {
		isProviderAdded: (id) =>
			(id === 'local-stt' && !!opts.localAdded) ||
			(id === 'siliconflow' && (opts.siliconflow === 'added' || opts.siliconflow === 'both')),
		hasApiKey: (id) =>
			(id === 'siliconflow' && (opts.siliconflow === 'key' || opts.siliconflow === 'both')) ||
			(id === 'groq-stt' && !!opts.groq) ||
			(id === 'openai-stt' && !!opts.openai)
	};
}

test('explicitly added siliconflow beats openai-stt even when both keys exist', () => {
	assert.equal(
		resolveActiveOpenAiStt(chain({ siliconflow: 'added', openai: true })),
		'siliconflow'
	);
	assert.equal(
		resolveActiveOpenAiStt(chain({ siliconflow: 'both', openai: true, groq: true })),
		'siliconflow'
	);
});

test('a key typed in SttSettings also marks added, so siliconflow wins over openai-stt', () => {
	// Typing a key calls markProviderAdded (SttSettings oninput), so the
	// reachable state is 'both'; siliconflow needs the added flag, not the key.
	assert.equal(resolveActiveOpenAiStt(chain({ siliconflow: 'both', openai: true })), 'siliconflow');
});

test('local-stt outranks everything once its URL is configured', () => {
	assert.equal(
		resolveActiveOpenAiStt(chain({ localAdded: true, siliconflow: 'both', groq: true, openai: true })),
		'local-stt'
	);
});

test('groq key beats openai-stt when siliconflow is absent', () => {
	assert.equal(resolveActiveOpenAiStt(chain({ groq: true, openai: true })), 'groq-stt');
});

test('openai-stt is the last resort with only its key present', () => {
	assert.equal(resolveActiveOpenAiStt(chain({ openai: true })), 'openai-stt');
});

test('nothing configured resolves to null (web speech fallback)', () => {
	assert.equal(resolveActiveOpenAiStt(chain({})), null);
});
