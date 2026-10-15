import test from 'node:test';
import assert from 'node:assert/strict';

// Kernel logic is dom-free and importable from node:test; browser-bound
// wrappers (getTheme/applyTheme/setTheme in theme.ts) are covered by e2e.
import { normalizeTheme, THEME_IDS } from './theme-kernel.ts';

test('unknown and empty values fall back to default', () => {
	assert.equal(normalizeTheme(null), 'default');
	assert.equal(normalizeTheme(undefined), 'default');
	assert.equal(normalizeTheme(''), 'default');
	assert.equal(normalizeTheme('crayon'), 'default');
	assert.equal(normalizeTheme('SAKURA'), 'default'); // case-sensitive ids
});

test('known ids pass through', () => {
	for (const id of THEME_IDS) {
		assert.equal(normalizeTheme(id), id);
	}
});

test('THEME_IDS leads with default', () => {
	assert.equal(THEME_IDS[0], 'default');
});
