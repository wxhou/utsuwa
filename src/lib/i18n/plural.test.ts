import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from './core.ts';

// Plural via the `*_one`/`*_other` convention: n === 1 → `_one`, else `_other`.
describe('i18n plural selection', () => {
	it('selects _other for n > 1', () => {
		assert.equal(translate('en', 'memory.memoriesCount', { n: 3 }), '3 memories');
	});

	it('selects _one for n === 1', () => {
		assert.equal(translate('en', 'memory.memoriesCount', { n: 1 }), '1 memory');
	});

	it('plural rules do not apply to keys without a numeric n param', () => {
		// memoriesCount has no suffix-stripping effect when n is absent: the
		// base key is used and params interpolated.
		assert.equal(translate('en', 'memory.memoriesCount'), '{n} memories');
	});

	it('Chinese plural keys carry the same text (no plural forms)', () => {
		assert.equal(translate('zh-CN', 'memory.memoriesCount', { n: 1 }), '1 条记忆');
		assert.equal(translate('zh-CN', 'memory.memoriesCount', { n: 9 }), '9 条记忆');
	});
});
