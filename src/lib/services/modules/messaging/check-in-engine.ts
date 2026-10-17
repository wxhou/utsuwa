// Slot-wake execution: kernel decision -> LLM greeting -> OS notification ->
// chat message + memory marker. Suppressed or failed runs are logged locally
// and abandoned by design (no canned text, no compensation); the log lines are
// the privacy-preserving telemetry trail (local only, never transmitted).
import { modulesStore } from '$lib/stores/modules.svelte';
import { chatStore } from '$lib/stores/chat.svelte';
import { characterStore } from '$lib/stores/character.svelte';
import { t, currentLocale } from '$lib/i18n';
import { recordTurn } from '$lib/engine/memory-session';
import {
	getFactsForCheckinCandidates,
	markFactUsedAsTrigger
} from '$lib/services/storage/memory';
import { resolveActiveLLM } from '$lib/services/llm/active-llm';
import { streamChat } from '$lib/services/llm/transport';
// Bare module path: the integration tests stub this exact specifier.
import { isTauri } from '$lib/services/platform';
import { tauriInvoke, type DeliveryOutcome } from './proactive-bridge';
import { logProactive } from './telemetry';
import { PROACTIVE_QUIET_PRESETS } from '../settings.ts';
import {
	clampMaxPerDay,
	decideCheckin,
	greetingMatchesLocale,
	type CheckinCandidate,
	type CheckinDecision,
	type CheckinSettings
} from './check-in-decision.ts';

// A reply round newer than this means the user is mid-conversation: don't cut in.
const ACTIVITY_TIMEOUT_MS = 10 * 60_000;
// A memory anchoring a check-in rests a week before it can anchor another.
const LOOKBACK_MS = 7 * 86_400_000;
// Generation beyond this is dropped silently: a late greeting is a stale one.
const GENERATION_TIMEOUT_MS = 25_000;
const GREETING_MAX_CHARS = 160;
// The anchoring memory is often stored in another language than the one the
// user reads the app in, and the model follows whatever the quoted memory uses.
// The greeting must be in the app's language.
const GREETING_LANGUAGE: Record<string, string> = {
	en: 'English',
	'zh-CN': 'Chinese (Simplified)'
};

async function proactiveSettings(): Promise<CheckinSettings> {
	const settings = modulesStore.getModuleSettings('proactive');
	const quiet =
		PROACTIVE_QUIET_PRESETS[settings.quietHours] ?? PROACTIVE_QUIET_PRESETS['23-9'];
	return {
		enabled: modulesStore.isModuleEnabled('proactive'),
		paused: !!settings.paused,
		maxPerDay: clampMaxPerDay(settings.maxPerDay),
		quietStartMin: quiet.start,
		quietEndMin: quiet.end,
		quietEnabled: settings.quietEnabled,
		tzOffsetMin: -new Date().getTimezoneOffset()
	};
}

// The model sometimes follows the quoted memory's language instead of the
// instruction: a wrong-language greeting is regenerated once, then dropped.
const GREETING_ATTEMPTS = 2;

async function generateGreetingOnce(memoryContent: string): Promise<string> {
	const llm = resolveActiveLLM();
	if (!llm || !llm.model) throw new Error('LLM unavailable for check-in');

	const name = characterStore.name || 'the companion';
	const tone = characterStore.systemPrompt?.slice(0, 400) ?? '';
	const systemPrompt =
		`You are ${name}, a companion reaching out to the person you care about.` +
		(tone ? ` Your character: ${tone}` : '');
	const ask =
		`Something this person said or did is on your mind: "${memoryContent}". ` +
		`Write ONE short message (1-2 sentences, under ${GREETING_MAX_CHARS} characters) in ` +
		`${GREETING_LANGUAGE[currentLocale()] ?? 'English'}: reference that memory naturally, in ` +
		`your own voice. Keep your usual tone. ` +
		`Do not ask how they are doing. Reply with the message only.`;

	const text = await streamChat(
		{
			...llm,
			systemPrompt,
			messages: [{ role: 'user', content: ask }],
			signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS)
		},
		() => {}
	);
	return text.slice(0, 400).trim();
}

async function generateGreeting(memoryContent: string): Promise<string> {
	for (let attempt = 1; attempt <= GREETING_ATTEMPTS; attempt++) {
		const text = await generateGreetingOnce(memoryContent);
		if (!text) return '';
		if (greetingMatchesLocale(text, currentLocale())) return text;
		logProactive('generation_language_mismatch', { attempt, locale: currentLocale() });
	}
	return '';
}

/** Called from the Rust slot wake. Fully silent on every rejection path. */
export async function handleCheckinSlotWake(slotAt: number): Promise<void> {
	if (!isTauri()) return;
	try {
		// sentToday and the activity timestamp come from the Rust aggregator, so
		// the kernel sees the cross-window state, not just this window's.
		const snapshot = await tauriInvoke<{ sentToday?: number; lastActivityMs?: number }>('checkin_state');
		const settings = await proactiveSettings();
		const facts = await getFactsForCheckinCandidates();
		const candidates: CheckinCandidate[] = facts
			.filter((f) => f.id !== undefined)
			.map((f) => ({
				id: f.id as number,
				content: f.content,
				importance: f.importance,
				lastUsedAsTrigger: f.lastUsedAsTrigger?.getTime()
			}));
		const decision: CheckinDecision = decideCheckin(settings, {
			nowMs: Date.now(),
			sentToday: snapshot?.sentToday ?? 0,
			lastActivityMs: snapshot?.lastActivityMs ?? 0,
			activityTimeoutMs: ACTIVITY_TIMEOUT_MS,
			lookbackMs: LOOKBACK_MS,
			candidates
		});
		if (!decision.allow) {
			logProactive('slot_suppressed', { slot: slotAt, reason: decision.reason });
			return;
		}

		const candidate = decision.candidate;
		const greeting = (await generateGreeting(candidate.content)) || null;
		if (!greeting) {
			logProactive('generation_empty', { slot: slotAt });
			return;
		}

		const run = await tauriInvoke<{ accepted?: boolean; delivery?: DeliveryOutcome }>(
			'send_checkin_notification',
			{
				title: t('proactive.notifyTitle'),
				body: greeting,
				memoryId: candidate.id
			}
		);
		if (!run?.accepted) {
			logProactive('send_rejected', { slot: slotAt, memory: candidate.id });
			return;
		}

		// A message the OS would not carry still belongs in the conversation: that is
		// the only place the user can see it, so it goes in marked as in-app only.
		const checkin = {
			proactive: true,
			memoryId: candidate.id,
			memoryContent: candidate.content,
			...(run.delivery === 'undelivered' ? { systemNotifyFailed: true } : {})
		};

		await markFactUsedAsTrigger(candidate.id, new Date());
		logProactive('checkin_sent', {
			slot: slotAt,
			memory: candidate.id,
			delivery: run.delivery ?? 'unknown'
		});

		// Both surfaces stay one conversation: the local window appends, the
		// persisted turn reaches the other window through the turn broadcast.
		chatStore.addMessage('assistant', greeting, undefined, checkin);
		await recordTurn({
			role: 'assistant',
			content: greeting,
			metadata: checkin
		});
	} catch (e) {
		// Provider unavailability is the designed silent-skip path.
		console.debug('[Checkin] slot skipped:', e);
	}
}