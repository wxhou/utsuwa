import test from 'node:test';
import assert from 'node:assert/strict';

import { phaseLabelKey } from './chat-phase.ts';

test('maps remembering to its label', () => {
	assert.equal(phaseLabelKey('remembering'), 'chat.remembering');
});

test('maps seeing to its label', () => {
	assert.equal(phaseLabelKey('seeing'), 'chat.lookingAtPhoto');
});

test('maps thinking to its label', () => {
	assert.equal(phaseLabelKey('thinking'), 'chat.thinking');
});
