// NOTE: relative imports use .ts extensions because this file is loaded directly
// by the Node test runner (`node --test --experimental-strip-types`).

// Pure decision kernel for memory-triggered proactive check-ins. The Rust
// scheduler enforces the same hard gates independently; this kernel is the
// frontend-side authority for the final allow call (it also sees session
// activity and the memory pool, which Rust never holds).

export interface CheckinSettings {
	enabled: boolean;
	paused: boolean;
	maxPerDay: number;
	quietStartMin: number;
	quietEndMin: number;
	quietEnabled: boolean;
	tzOffsetMin: number;
}

/** A memory sticker offered as a check-in trigger. */
export interface CheckinCandidate {
	id: number;
	content: string;
	importance: number;
	/** Epoch ms when this memory last anchored a check-in; unset = never. */
	lastUsedAsTrigger?: number;
}

export interface CheckinContext {
	nowMs: number;
	sentToday: number;
	/** Newest session activity pushed from either window; 0 = no signal yet. */
	lastActivityMs: number;
	/** An activity newer than this means the user is in a conversation. */
	activityTimeoutMs: number;
	/** A memory used as a trigger within this window is not reused. */
	lookbackMs: number;
	candidates: CheckinCandidate[];
}

export type SuppressionReason =
	| 'disabled'
	| 'paused'
	| 'budget-exhausted'
	| 'quiet-hours'
	| 'session-active'
	| 'no-candidate';

export type CheckinDecision =
	| { allow: true; candidate: CheckinCandidate }
	| { allow: false; reason: SuppressionReason };

/** The daily budget can only be lowered from the default of 3. */
export const DEFAULT_MAX_PER_DAY = 3;

export function minutesOfDay(nowMs: number, tzOffsetMin: number): number {
	const daySecs = Math.floor((nowMs + tzOffsetMin * 60_000) / 1000);
	return Math.floor((daySecs % 86_400) / 60);
}

export function inQuiet(
	minutes: number,
	quiet: { start: number; end: number; enabled: boolean }
): boolean {
	if (!quiet.enabled || quiet.start === quiet.end) return false;
	if (quiet.start < quiet.end) {
		return minutes >= quiet.start && minutes < quiet.end;
	}
	// A start past the end wraps across midnight (23:00 -> 9:00).
	return minutes >= quiet.start || minutes < quiet.end;
}

export function clampMaxPerDay(maxPerDay: unknown): number {
	const n = typeof maxPerDay === 'number' && Number.isFinite(maxPerDay) ? Math.floor(maxPerDay) : DEFAULT_MAX_PER_DAY;
	return Math.min(Math.max(1, n), DEFAULT_MAX_PER_DAY);
}

/** A greeting must read in the language the app is in. The model follows the
 * quoted memory's language often enough that the prompt instruction alone is not
 * reliable, so the result is checked before it is sent. */
export function greetingMatchesLocale(text: string, locale: string): boolean {
	const hasCJK = /\p{Script=Han}/u.test(text);
	return locale === 'zh-CN' ? hasCJK : !hasCJK;
}

function isSessionActive(ctx: CheckinContext): boolean {
	if (ctx.lastActivityMs === 0) return false;
	return ctx.nowMs - ctx.lastActivityMs < ctx.activityTimeoutMs;
}

/** Highest-importance candidate not already used as a trigger within the lookback window. */
export function pickCandidate(candidates: CheckinCandidate[], ctx: CheckinContext): CheckinCandidate | null {
	const fresh = candidates
		.filter((c) => {
			if (c.lastUsedAsTrigger === undefined) return true;
			return ctx.nowMs - c.lastUsedAsTrigger >= ctx.lookbackMs;
		})
		.sort((a, b) => b.importance - a.importance);
	return fresh[0] ?? null;
}

export function decideCheckin(settings: CheckinSettings, ctx: CheckinContext): CheckinDecision {
	if (!settings.enabled) return { allow: false, reason: 'disabled' };
	if (settings.paused) return { allow: false, reason: 'paused' };
	if (ctx.sentToday >= clampMaxPerDay(settings.maxPerDay)) {
		return { allow: false, reason: 'budget-exhausted' };
	}
	const minutes = minutesOfDay(ctx.nowMs, settings.tzOffsetMin);
	if (inQuiet(minutes, { start: settings.quietStartMin, end: settings.quietEndMin, enabled: settings.quietEnabled })) {
		return { allow: false, reason: 'quiet-hours' };
	}
	if (isSessionActive(ctx)) return { allow: false, reason: 'session-active' };
	const candidate = pickCandidate(ctx.candidates, ctx);
	if (!candidate) return { allow: false, reason: 'no-candidate' };
	return { allow: true, candidate };
}