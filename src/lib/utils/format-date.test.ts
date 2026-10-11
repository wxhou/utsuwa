import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate } from './format-date.ts';

describe('formatDate locale parameterization', () => {
	const date = new Date('2026-03-05T00:00:00');

	it('formats in English by default', () => {
		assert.match(formatDate(date), /March 5, 2026/);
	});

	it('formats in Chinese for zh-CN', () => {
		assert.equal(formatDate(date, 'zh-CN'), '2026年3月5日');
	});

	it('accepts an ISO date string', () => {
		assert.match(formatDate('2026-03-05', 'zh-CN'), /2026年3月5日/);
	});
});