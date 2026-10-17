// Frontend <-> Rust bridge for the desktop resident scheduler: versioned
// schedule snapshots, session-activity signals, and Rust events routed back
// into the app. Every export no-ops outside Tauri (web keeps its own paths).

import { writable } from 'svelte/store';
// Bare module path: the integration tests stub this exact specifier.
import { isTauri } from '$lib/services/platform';
import { PROACTIVE_QUIET_PRESETS, type ProactiveSettings } from '../settings.ts';

// Tauri APIs load dynamically: this module sits in import graphs that the node
// test runner loads headlessly, where the desktop packages must not resolve.
export async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<T>(cmd, args);
}

export const EVT_REMINDER_FIRED = 'resident:reminder-fired';
export const EVT_CHECKIN_SLOT_WAKE = 'resident:checkin-slot-wake';
export const EVT_CHECKIN_SENT = 'resident:checkin-sent';
export const EVT_NOTIFICATION_ACTION = 'resident:notification-action';

/** How far a proactive message got, as the desktop delivery layer reports it. */
export type DeliveryOutcome = 'sent' | 'frontmost' | 'undelivered';

export interface ReminderFired {
	key: string;
	title: string;
	body: string;
	sessionId?: number;
	triggerAt: number;
	delivery?: DeliveryOutcome;
}

export interface SnapshotReminder {
	key: string;
	/** Epoch ms. */
	triggerAt: number;
	title: string;
	body: string;
	sessionId?: number;
}

export interface CheckinSettingsSnapshot {
	enabled: boolean;
	paused: boolean;
	maxPerDay: number;
	quietStartMin: number;
	quietEndMin: number;
	quietEnabled: boolean;
	tzOffsetMin: number;
}

export interface NotificationActionPayload {
	kind?: string;
	key?: string;
	sessionId?: number;
	memoryId?: number;
	/** Present only when the action was a reply typed inside the notification. */
	userText?: string;
	actionId: string;
}

export interface ResidentEventHandlers {
	onReminderFired?: (fire: ReminderFired) => void;
	onCheckinSlotWake?: (slotAt: number) => void;
	onCheckinSent?: (payload: { memoryId?: number; sentAt: number }) => void;
	onNotificationAction?: (payload: NotificationActionPayload) => void;
}

/** The check-in a notification click points at, for the chat window to scroll to and open. */
export const checkinFocus = writable<{ memoryId?: number; requestId: number } | null>(null);

// Newest activity across all conversation turns pushed to this bridge. The
// kernel reads it as the second gate; Rust stores its own copy.
let lastActivityMs = 0;

export function getLastActivityMs(): number {
	return lastActivityMs;
}

/** Session start or a reply round in this window; Rust receives the same signal. */
export function noteSessionActivity(): void {
	lastActivityMs = Date.now();
	if (!isTauri()) return;
	tauriInvoke('report_session_activity').catch((e: unknown) =>
		console.error('[Proactive] activity signal failed:', e)
	);
}

export function checkinConfigFromSettings(
	settings: ProactiveSettings,
	moduleEnabled: boolean
): CheckinSettingsSnapshot {
	// The daily budget can only be lowered from the default of 3.
	const rawMax = Math.floor(settings.maxPerDay);
	const quiet = PROACTIVE_QUIET_PRESETS[String(settings.quietHours)] ?? PROACTIVE_QUIET_PRESETS['23-9'];
	return {
		enabled: !!moduleEnabled,
		paused: !!settings.paused,
		maxPerDay: Math.min(Math.max(1, rawMax), 3),
		quietStartMin: quiet.start,
		quietEndMin: quiet.end,
		quietEnabled: !!settings.quietEnabled,
		// Tauri wants UTC offset as "minutes east of UTC"; getTimezoneOffset is minutes west.
		tzOffsetMin: typeof window !== 'undefined' ? -new Date().getTimezoneOffset() : 0
	};
}

/** Full snapshot push. Reminders keep their trigger timestamps; the budget
 * config and pause switch ride along so Rust gating sees one consistent state. */
export async function pushScheduleSnapshot(
	reminders: SnapshotReminder[],
	checkin: CheckinSettingsSnapshot
): Promise<void> {
	if (!isTauri()) return;
	try {
		await tauriInvoke('push_schedule_snapshot', {
			snapshot: {
				version: Date.now(),
				reminders,
				checkin
			}
		});
	} catch (e) {
		console.error('[Proactive] schedule push failed:', e);
	}
}

export async function requestNotificationPermission(): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		return await tauriInvoke<string>('request_notification_permission');
	} catch (e) {
		console.error('[Proactive] permission request failed:', e);
		return null;
	}
}

export async function queryNotificationPermission(): Promise<string | null> {
	if (!isTauri()) return null;
	try {
		return await tauriInvoke<string>('notification_permission_state');
	} catch (e) {
		console.error('[Proactive] permission query failed:', e);
		return null;
	}
}

export async function openNotificationSettings(): Promise<void> {
	if (!isTauri()) return;
	try {
		await tauriInvoke('open_notification_settings');
	} catch (e) {
		console.error('[Proactive] opening system settings failed:', e);
	}
}

/** Notification buttons are per-platform and per-language, so the delivery layer
 * registers their labels once at startup rather than shipping fixed strings. */
export async function registerNotificationCategories(labels: {
	reply: string;
	replyPlaceholder: string;
	replyButton: string;
	complete: string;
}): Promise<void> {
	if (!isTauri()) return;
	try {
		await tauriInvoke('register_notification_categories', { labels });
	} catch (e) {
		console.error('[Proactive] registering notification actions failed:', e);
	}
}

// The main window's chat pipeline, injected at startup so the bridge stays free of
// it (the same indirection the event handlers below use).
let notificationReplySender: ((text: string) => void) | null = null;

export function setNotificationReplySender(send: (text: string) => void): void {
	notificationReplySender = send;
}

/** Sends a reply typed straight into a notification through the normal chat chain. */
export function sendNotificationReply(text: string): void {
	notificationReplySender?.(text);
}

/** Withdraw queued (not yet released) check-in slots; used by one-tap pause and disable. */
export async function dismissPendingCheckins(): Promise<void> {
	if (!isTauri()) return;
	try {
		await tauriInvoke('dismiss_pending_checkins');
	} catch (e) {
		console.error('[Proactive] dismissing pending check-ins failed:', e);
	}
}

/**
 * Route Rust events into handlers. Handlers are injected at startup so the
 * bridge stays dependency-free (the engine and stores import this module).
 * Returns the unlisten function; identity no-ops outside Tauri.
 */
export async function connectResidentEvents(
	handlers: ResidentEventHandlers
): Promise<() => void> {
	if (!isTauri()) return () => {};
	const { listen } = await import('@tauri-apps/api/event');
	const unlistens = await Promise.all([
		listen<unknown>(EVT_REMINDER_FIRED, (event) => {
			const fire = event.payload as (Partial<ReminderFired> & { triggerAt?: number }) | null;
			if (fire?.key && typeof fire.triggerAt === 'number') {
				handlers.onReminderFired?.({
					key: fire.key,
					title: fire.title ?? '',
					body: fire.body ?? '',
					sessionId: fire.sessionId,
					triggerAt: fire.triggerAt,
					delivery: fire.delivery
				});
			}
		}),
		listen<unknown>(EVT_CHECKIN_SLOT_WAKE, (event) => {
			const wake = event.payload as { slotAt?: number } | null;
			if (typeof wake?.slotAt === 'number') handlers.onCheckinSlotWake?.(wake.slotAt);
		}),
		listen<unknown>(EVT_CHECKIN_SENT, (event) => {
			const sent = event.payload as { memoryId?: number; sentAt?: number } | null;
			if (typeof sent?.sentAt === 'number') {
				handlers.onCheckinSent?.({ memoryId: sent.memoryId, sentAt: sent.sentAt });
			}
		}),
		listen<unknown>(EVT_NOTIFICATION_ACTION, (event) => {
			const payload = event.payload as Partial<NotificationActionPayload> | null;
			if (!payload?.actionId) return;
			handlers.onNotificationAction?.({
				kind: payload.kind,
				key: payload.key,
				sessionId: payload.sessionId,
				memoryId: payload.memoryId,
				userText: payload.userText,
				actionId: payload.actionId
			});
		})
	]);
	return () => unlistens.forEach((fn) => fn());
}