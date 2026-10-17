// NOTE: relative imports use .ts extensions because this file is loaded directly
// by the Node test runner (`node --test --experimental-strip-types`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	clampMaxPerDay,
	decideCheckin,
	greetingMatchesLocale,
	inQuiet,
	minutesOfDay,
	pickCandidate,
	type CheckinCandidate,
	type CheckinContext,
	type CheckinSettings
} from './check-in-decision.ts';

// 2026-10-16T00:00:00Z. The kernel is time-zone free: tests always pin
// tzOffsetMin so times read in the local day.
const DAY0 = 1_792_108_800_000;

function settings(overrides: Partial<CheckinSettings> = {}): CheckinSettings {
	return {
		enabled: true,
		paused: false,
		maxPerDay: 3,
		quietStartMin: 23 * 60,
		quietEndMin: 9 * 60,
		quietEnabled: true,
		tzOffsetMin: 0,
		...overrides
	};
}

function ctx(overrides: Partial<CheckinContext> = {}): CheckinContext {
	const candidates: CheckinCandidate[] = [
		{ id: 1, content: 'likes night walks', importance: 80 },
		{ id: 2, content: 'birthday next month', importance: 95 }
	];
	return {
		nowMs: DAY0 + 12 * 3_600_000, // 12:00 local
		sentToday: 0,
		lastActivityMs: 0,
		activityTimeoutMs: 30 * 60_000,
		lookbackMs: 7 * 86_400_000,
		candidates,
		...overrides
	};
}

test('budget: within budget allows; exhausted suppresses; clamp keeps default ceiling', () => {
	// sentToday = 2 with clamped default 3 -> allowed
	const ok = decideCheckin(settings(), ctx({ sentToday: 2 }));
	assert.equal(ok.allow, true);

	const spent = decideCheckin(settings(), ctx({ sentToday: 3 }));
	assert.deepEqual(spent, { allow: false, reason: 'budget-exhausted' });

	// maxPerDay can only be lowered: 5 clamps to 3.
	assert.equal(clampMaxPerDay(5), 3);
	assert.equal(clampMaxPerDay(1), 1);
	assert.equal(clampMaxPerDay(0), 1);
	assert.equal(clampMaxPerDay(9.7), 3);
	const lowered = decideCheckin(settings({ maxPerDay: 1 }), ctx({ sentToday: 1 }));
	assert.deepEqual(lowered, { allow: false, reason: 'budget-exhausted' });
});

test('quiet hours: wrap window boundaries suppress exactly 23:00-9:00', () => {
	// 08:59 quiet, 09:00 open, 22:59 open, 23:00 quiet.
	assert.equal(decideCheckin(settings(), ctx({ nowMs: DAY0 + 8 * 3_600_000 + 59 * 60_000 })).allow, false);
	assert.equal(decideCheckin(settings(), ctx({ nowMs: DAY0 + 9 * 3_600_000 })).allow, true);
	assert.equal(decideCheckin(settings(), ctx({ nowMs: DAY0 + 22 * 3_600_000 + 59 * 60_000 })).allow, true);
	assert.equal(decideCheckin(settings(), ctx({ nowMs: DAY0 + 23 * 3_600_000 })).allow, false);

	const q = { start: 23 * 60, end: 9 * 60, enabled: true };
	assert.equal(inQuiet(minutesOfDay(DAY0 + 5 * 3_600_000, 0), q), true);
	// Quiet disabled: night allowed.
	const nightOpen = settings({ quietEnabled: false });
	assert.equal(decideCheckin(nightOpen, ctx({ nowMs: DAY0 + 3 * 3_600_000 })).allow, true);
});

test('session activity: fresh activity suppresses; idle or absent signal allows', () => {
	const base = ctx({ nowMs: DAY0 + 12 * 3_600_000 });
	const active = decideCheckin(settings(), { ...base, lastActivityMs: base.nowMs - 10 * 60_000 });
	assert.deepEqual(active, { allow: false, reason: 'session-active' });

	const idle = decideCheckin(settings(), { ...base, lastActivityMs: base.nowMs - 31 * 60_000 });
	assert.equal(idle.allow, true);

	// Signal exactly at the timeout boundary counts as idle (>=).
	const boundary = decideCheckin(settings(), { ...base, lastActivityMs: base.nowMs - base.activityTimeoutMs });
	assert.equal(boundary.allow, true);

	// No activity signal yet (0) is not active.
	const noSignal = decideCheckin(settings(), { ...base, lastActivityMs: 0 });
	assert.equal(noSignal.allow, true);
});

test('candidates: importance wins, lookback-window entries are skipped, empty pool reports no-candidate', () => {
	// High-importance used 2 days ago (within 7-day lookback) -> next one wins.
	const recent = [ctx().candidates[0], { ...ctx().candidates[1], lastUsedAsTrigger: DAY0 - 2 * 86_400_000 }];
	const picked = pickCandidate(recent, ctx());
	assert.equal(picked && picked.id, 1);

	// Used 8 days ago (beyond lookback) -> selectable again.
	const old = [
		{ ...ctx().candidates[0], lastUsedAsTrigger: DAY0 - 8 * 86_400_000 },
		ctx().candidates[1]
	];
	// Both selectable: the higher-importance one (id 2) wins.
	assert.equal(pickCandidate(old, ctx()) && pickCandidate(old, ctx())?.id, 2);

	const all = decideCheckin(settings(), ctx({ candidates: [ctx().candidates[1]] }));
	assert.deepEqual(all, { allow: true, candidate: ctx().candidates[1] });

	const none = decideCheckin(settings(), ctx({ candidates: [] }));
	assert.deepEqual(none, { allow: false, reason: 'no-candidate' });
});

test('suppression reasons report in gate order; disabled and paused lead', () => {
	assert.deepEqual(decideCheckin(settings({ enabled: false }), ctx()), { allow: false, reason: 'disabled' });
	assert.deepEqual(decideCheckin(settings({ paused: true }), ctx({ sentToday: 99 })), {
		allow: false,
		reason: 'paused'
	});
	// Disabled wins over paused and budget.
	assert.deepEqual(decideCheckin(settings({ enabled: false, paused: true }), ctx({ sentToday: 99 })), {
		allow: false,
		reason: 'disabled'
	});
	assert.deepEqual(
		decideCheckin(settings(), ctx({ sentToday: 3, nowMs: DAY0 + 23 * 3_600_000 })),
		{ allow: false, reason: 'budget-exhausted' }
	);
});

test('tz offset shifts the local day used by quiet hours', () => {
	// 23:00 UTC would be quiet at tz 0; at UTC-8 it is 15:00 local -> open.
	const west = settings({ tzOffsetMin: -8 * 60 });
	assert.equal(decideCheckin(west, ctx({ nowMs: DAY0 + 23 * 3_600_000 })).allow, true);
});

test('greeting language: Han script required for zh-CN, absent for en', () => {
	// A greeting anchored in an English memory but meant for a Chinese UI.
	assert.equal(greetingMatchesLocale('想到你说过，周三有吉他课。', 'zh-CN'), true);
	assert.equal(greetingMatchesLocale('I keep thinking about your guitar lessons.', 'zh-CN'), false);
	assert.equal(greetingMatchesLocale('I keep thinking about your guitar lessons.', 'en'), true);
	assert.equal(greetingMatchesLocale('想到你说过，周三有吉他课。', 'en'), false);
	// Empty output is the caller's concern, not a language match.
	assert.equal(greetingMatchesLocale('', 'zh-CN'), false);
});