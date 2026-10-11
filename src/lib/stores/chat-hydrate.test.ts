import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { turnsToMessages } from './chat-hydrate.ts';

describe('turnsToMessages', () => {
	const turns = [
		{ role: 'user' as const, content: '你好', createdAt: new Date('2026-09-27T10:00:00') },
		{ role: 'assistant' as const, content: '你好呀！', createdAt: new Date('2026-09-27T10:00:05') }
	];

	it('maps persisted turns to display messages in order', () => {
		const messages = turnsToMessages(turns);
		assert.equal(messages.length, 2);
		assert.deepEqual(
			messages.map((m) => [m.role, m.content]),
			[
				['user', '你好'],
				['assistant', '你好呀！']
			]
		);
		assert.deepEqual(messages[0].timestamp, new Date('2026-09-27T10:00:00'));
		assert.deepEqual(messages[1].timestamp, new Date('2026-09-27T10:00:05'));
	});

	it('assigns a unique id to every message', () => {
		const messages = turnsToMessages([...turns, ...turns]);
		const ids = new Set(messages.map((m) => m.id));
		assert.equal(ids.size, messages.length);
	});

	it('returns an empty list for empty history', () => {
		assert.deepEqual(turnsToMessages([]), []);
	});
});
