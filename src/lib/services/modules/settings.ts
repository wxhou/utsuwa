// Shape and defaults of the two essential modules' settings. The store merges
// saved settings over these, so readers never need their own fallbacks.

export interface ConsciousnessSettings {
	activeProvider: string;
	activeModel?: string;
	temperature: number;
	topP: number;
	/** Unset means the provider default. */
	maxTokens?: number;
	/** Unset keeps the default memory budget. */
	contextSize?: number;
	presencePenalty: number;
	frequencyPenalty: number;
}

// A separate model that looks at photos so the chat model doesn't have to.
// Only used while the vision module is switched on.
export interface VisionSettings {
	activeProvider: string;
	activeModel?: string;
}

export interface SpeechSettings {
	activeProvider: string;
	activeModel?: string;
	activeVoiceId?: string;
	activeLanguage: string;
	enableAltLanguage: boolean;
	enableToolCalling: boolean;
	altLanguage: string;
	altVoiceId: string;
	altInstructions: string;
	altSpeed: number;
	altNumStep: number;
	altPositionTemperature: number;
	altClassTemperature: number;
	speed: number;
	/** Playback volume multiplier; unset/1 is normal (schema default). */
	volume?: number;
	instructions?: string;
	numStep: number;
	positionTemperature: number;
	classTemperature: number;
}

export const DEFAULT_CONSCIOUSNESS_SETTINGS: Readonly<ConsciousnessSettings> = {
	activeProvider: '',
	temperature: 0.7,
	topP: 1,
	presencePenalty: 0,
	frequencyPenalty: 0
};

export const DEFAULT_VISION_SETTINGS: Readonly<VisionSettings> = {
	activeProvider: ''
};

// Quiet hours as a select preset (value "start-end" in local minutes-of-day),
// because the module system only knows preset field types — no time-range
// control exists. The kernel parses the preset back into minutes.
export interface ProactiveSettings {
	/** Check-ins stay below this many per local day; raising above 3 is not offered. */
	maxPerDay: number;
	/** 'start-end' preset key from PROACTIVE_QUIET_PRESETS. */
	quietHours: string;
	quietEnabled: boolean;
	/** One-tap pause: stops everything and withdraws queued slots until unpaused. */
	paused: boolean;
}

export const PROACTIVE_QUIET_PRESETS: Record<string, { start: number; end: number }> = {
	'22-8': { start: 22 * 60, end: 8 * 60 },
	'23-9': { start: 23 * 60, end: 9 * 60 },
	'0-7': { start: 0, end: 7 * 60 }
};

export const DEFAULT_PROACTIVE_SETTINGS: Readonly<ProactiveSettings> = {
	maxPerDay: 3,
	quietHours: '23-9',
	quietEnabled: true,
	paused: false
};

export const DEFAULT_SPEECH_SETTINGS: Readonly<SpeechSettings> = {
	activeProvider: '',
	activeLanguage: 'en',
	enableAltLanguage: false,
	enableToolCalling: true,
	altLanguage: '',
	altVoiceId: '',
	altInstructions: '',
	altSpeed: 1,
	altNumStep: 32,
	altPositionTemperature: 1,
	altClassTemperature: 0.2,
	speed: 1,
	numStep: 32,
	positionTemperature: 1,
	classTemperature: 0.2
};

export interface TypedModuleSettings {
	consciousness: ConsciousnessSettings;
	speech: SpeechSettings;
	vision: VisionSettings;
	proactive: ProactiveSettings;
}

export type ModuleSettings<Id extends string> = Id extends keyof TypedModuleSettings
	? TypedModuleSettings[Id]
	: Record<string, unknown>;

const MODULE_DEFAULTS: Record<string, object> = {
	consciousness: DEFAULT_CONSCIOUSNESS_SETTINGS,
	speech: DEFAULT_SPEECH_SETTINGS,
	vision: DEFAULT_VISION_SETTINGS,
	proactive: DEFAULT_PROACTIVE_SETTINGS
};

/** Saved keys win (including 0, false, ''); missing ones come from the defaults. */
export function withModuleDefaults(moduleId: string, saved: object | undefined): Record<string, unknown> {
	return { ...MODULE_DEFAULTS[moduleId], ...saved };
}
