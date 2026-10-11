/** What the companion is actually doing while a turn is in flight. */
export type ThinkingPhase = 'remembering' | 'seeing' | 'thinking';

// UI label lives in the i18n dictionary; this maps the phase to its key.
const LABEL_KEYS: Record<ThinkingPhase, 'chat.remembering' | 'chat.lookingAtPhoto' | 'chat.thinking'> = {
	remembering: 'chat.remembering',
	seeing: 'chat.lookingAtPhoto',
	thinking: 'chat.thinking'
};

export function phaseLabelKey(phase: ThinkingPhase) {
	return LABEL_KEYS[phase];
}
