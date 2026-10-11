import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translate } from './core.ts';
import { en } from './locales/en.ts';
import { zhCN } from './locales/zh-CN.ts';

describe('i18n translate()', () => {
	it('returns the English text for a known key', () => {
		assert.equal(translate('en', 'common.cancel'), 'Cancel');
	});

	it('returns the Chinese text for zh-CN', () => {
		assert.equal(translate('zh-CN', 'common.cancel'), '取消');
	});

	it('falls back to English when the Chinese dictionary lacks a key', () => {
		const asRecord = zhCN as Record<string, unknown>;
		const backup = asRecord['onboarding.getStarted'];
		delete asRecord['onboarding.getStarted'];
		try {
			assert.equal(translate('zh-CN', 'onboarding.getStarted'), en.onboarding.getStarted);
		} finally {
			asRecord['onboarding.getStarted'] = backup;
		}
	});

	it('returns empty string when both dictionaries lack the key', () => {
		assert.equal(translate('en', 'ghost.key.does.not.exist' as never), '');
	});

	it('interpolates {name} params and keeps unknown params literal', () => {
		assert.equal(translate('en', 'memory.memoriesCount', { n: 5 }), '5 memories');
		assert.equal(translate('zh-CN', 'memory.memoriesCount', { n: 5 }), '5 条记忆');
		// Unknown param name stays as a literal {name} placeholder.
		assert.match(translate('en', 'memory.memoriesCount', { unknown: 'x' }), /\{n\}/);
	});
});
