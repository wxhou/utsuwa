import test from 'node:test';
import assert from 'node:assert/strict';

import {
	filterUnshownEvents,
	isEventShown,
	isReplayableOnMount,
	markEventShown,
	shownEventIds
} from './event-replay.ts';
import type { EventDefinition } from '$lib/types/events';

function event(id: string, priority: number, conditions: EventDefinition['conditions']): EventDefinition {
	return { id, type: 'conditional', priority, conditions } as unknown as EventDefinition;
}

const shownEvent = event('already_shown', 50, [{ type: 'min_affection', value: 10 }]);
const freshEvent = event('fresh_event', 30, [{ type: 'min_affection', value: 10 }]);
const randomEvent = event('random_once', 20, [{ type: 'random_chance', value: 0.1 }]);

test('filter drops events already shown and keeps the rest', () => {
	const filtered = filterUnshownEvents([shownEvent, freshEvent], new Set(['already_shown']));
	assert.deepEqual(
		filtered.map((e) => e.id),
		['fresh_event']
	);
});

test('filter preserves priority order and passes an empty shown set through', () => {
	const triggered = [shownEvent, freshEvent, randomEvent];
	assert.deepEqual(
		filterUnshownEvents(triggered, new Set()).map((e) => e.id),
		triggered.map((e) => e.id)
	);
});

test('mount replay only considers deterministic events', () => {
	assert.equal(isReplayableOnMount(shownEvent), true);
	assert.equal(isReplayableOnMount(randomEvent), false);
});

test('markEventShown registers the event for the session view', () => {
	markEventShown('session_probe');
	assert.equal(isEventShown('session_probe'), true);
	assert.equal(shownEventIds().has('session_probe'), true);
});