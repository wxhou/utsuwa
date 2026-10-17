// Local-only event trail for the proactive module. The three metrics the spec
// asks for — how many check-ins went out, how many were acted on, and how often
// the module gets turned off or paused after being turned on — are all derivable
// from these lines. The project has no telemetry backend and this never leaves
// the device.

export type ProactiveEvent =
	| 'module_enabled'
	| 'module_disabled'
	| 'module_settings_changed'
	| 'checkin_sent'
	| 'notification_action'
	| 'slot_suppressed'
	| 'generation_empty'
	| 'generation_language_mismatch'
	| 'send_rejected';

export function logProactive(
	event: ProactiveEvent,
	fields: Record<string, string | number | boolean | undefined> = {}
): void {
	const parts = Object.entries(fields)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}=${value}`);
	console.info(`[proactive-telemetry] ${event}${parts.length > 0 ? ' ' + parts.join(' ') : ''}`);
}
