import type { EventDefinition, CompletedEventRecord } from '$lib/types/events';
import * as eventsStorage from '$lib/services/storage/events';
import { characterStore } from '$lib/stores/character.svelte';
import { allEvents } from '$lib/data/events';
import { filterUnshownEvents, isReplayableOnMount, markEventShown, shownEventIds } from './event-replay';

// Pure matching logic lives in event-matching.ts (no storage dependency, unit-tested).
import { checkAllEvents } from './event-matching';

// Events API - uses IndexedDB storage directly
export const eventsApi = {
	async getCompletedEvents(): Promise<CompletedEventRecord[]> {
		return eventsStorage.getCompletedEvents();
	},

	async recordCompletedEvent(
		event: EventDefinition,
		choiceIndex?: number,
		outcome?: string
	): Promise<CompletedEventRecord> {
		const now = new Date();
		const id = await eventsStorage.saveCompletedEvent({
			eventId: event.id,
			eventType: event.type,
			choiceIndex,
			outcome,
			stateChanges: event.stateChanges,
			completedAt: now
		});
		return {
			id,
			eventId: event.id,
			eventType: event.type,
			choiceIndex,
			outcome,
			stateChanges: event.stateChanges,
			completedAt: now
		};
	}
};

/**
 * Mount replay: the pending event from a previous session gets exactly one
 * more showing on load. Mirrors the per-turn check (same condition set,
 * same DB completion records) minus the two classes of event a fresh load
 * must not surface: scenes already shown in this session, and random_chance
 * events whose contract is one roll per turn, not one per app start.
 */
export async function findReplayableEvent(): Promise<EventDefinition | null> {
	// loadState() runs fire-and-forget at store boot; wait for it to settle or
	// currentEvents would be matched against the default (pre-load) state.
	for (let i = 0; i < 400 && characterStore.isLoading; i++) {
		await new Promise((r) => setTimeout(r, 25));
	}
	if (!characterStore.isReady) return null;

	const completedEvents = await eventsApi.getCompletedEvents();
	const triggered = checkAllEvents(
		allEvents.filter(isReplayableOnMount),
		characterStore.state,
		completedEvents
	);
	const candidate = filterUnshownEvents(triggered, shownEventIds())[0];
	if (!candidate) return null;
	markEventShown(candidate.id);
	return candidate;
}
