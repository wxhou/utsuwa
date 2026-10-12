// Session-scoped event-scene dedup. An event scene is shown at most once per
// page session (module lifetime = until refresh); an unrest-completed scene is
// replayed once on the next session via the mount replay in events.ts.
// Pure filtering lives here so node --test can run it without storage deps.
import type { EventDefinition } from '../types/events.ts';

// Module-level, like the working-memory turn counter: one session per load.
const shownThisSession = new Set<string>();

export function markEventShown(eventId: string): void {
	shownThisSession.add(eventId);
}

export function isEventShown(eventId: string): boolean {
	return shownThisSession.has(eventId);
}

/** Read-only view for callers that filter with the pure function below. */
export function shownEventIds(): ReadonlySet<string> {
	return shownThisSession;
}

/** Drop triggered events already shown in this session. Order is preserved. */
export function filterUnshownEvents(
	triggered: EventDefinition[],
	shownIds: ReadonlySet<string>
): EventDefinition[] {
	return triggered.filter((event) => !shownIds.has(event.id));
}

/** Candidates the mount replay may show: deterministic events only — a
 *  random_chance condition means "roll once per turn", not "show on load". */
export function isReplayableOnMount(event: EventDefinition): boolean {
	return !event.conditions.some((c) => c.type === 'random_chance');
}