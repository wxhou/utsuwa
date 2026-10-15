import test from 'node:test';
import assert from 'node:assert/strict';

// Kernel logic is dom-free and importable from node:test; the browser-bound
// store in locale.svelte.ts is covered by e2e.
import { detectLocale, isSupportedLocale, SUPPORTED } from './locale-kernel.ts';
import type { Locale } from './types.ts';

test('unknown values are rejected', () => {
	assert.equal(isSupportedLocale('fr'), false);
	assert.equal(isSupportedLocale(null), false);
	assert.equal(isSupportedLocale('zh-TW'), false); // exact-match policy
	for (const id of SUPPORTED) assert.equal(isSupportedLocale(id), true);
});

test('detects the first supported locale in preference order', () => {
	assert.equal(detectLocale(['fr', 'zh-CN', 'en']), 'zh-CN');
	assert.equal(detectLocale(['en-US', 'zh-CN']), 'en'); // en family wins first
	assert.equal(detectLocale(['de', 'ja']), 'en'); // nothing supported
});

test('recognizes zh-CN and zh-Hans tags as simplified Chinese', () => {
	assert.equal(detectLocale(['zh-CN' as const]), 'zh-CN');
	assert.equal(detectLocale(['zh-Hans']), 'zh-CN');
	assert.equal(detectLocale(['zh-cn']), 'zh-CN'); // case-insensitive
});

test('zh dialects with a region stay untranslated (exact-match policy)', () => {
	assert.equal(detectLocale(['zh-TW']), 'en');
	assert.equal(detectLocale(['zh-HK']), 'en');
});

test('empty and junk input fall back to en', () => {
	assert.equal(detectLocale([]), 'en');
	assert.equal(detectLocale(['', '  ']), 'en');
});

const _type: Locale = detectLocale(['zh-CN']);
void _type;
