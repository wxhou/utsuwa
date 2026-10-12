import type { DictKey } from '../i18n/locales/en.ts';

// App mode - determines relationship mechanics
export type AppMode = 'companion' | 'dating_sim';

// Emotion types for mood state
export type Emotion =
	| 'happy'
	| 'sad'
	| 'excited'
	| 'anxious'
	| 'content'
	| 'frustrated'
	| 'curious'
	| 'affectionate'
	| 'playful'
	| 'melancholy'
	| 'flustered'
	| 'neutral';

// Mood state with causality tracking
export interface MoodState {
	primary: Emotion;
	intensity: number; // 0-100
	secondary?: Emotion;
	causes: string[]; // Why she feels this way
}

// Relationship stages (progression path)
export type RelationshipStage =
	| 'companion' // Locked stage for Companion Mode
	| 'stranger'
	| 'acquaintance'
	| 'friend'
	| 'close_friend'
	| 'romantic_interest'
	| 'dating'
	| 'committed'
	| 'soulmate';

// Romantic style preferences
export type RomanticStyle = 'slow_burn' | 'passionate' | 'shy' | 'bold';

// Personality profile (can drift based on interactions)
export interface PersonalityProfile {
	// Core axes (-100 to 100)
	openness: number;
	warmth: number;
	assertiveness: number;
	playfulness: number;
	sensitivity: number;

	// Learned preferences (-100 to 100)
	likesTeasing: number;
	prefersDirectness: number;

	// Romantic approach
	romanticStyle: RomanticStyle;
}

// Persona extensions (module configs, agents, custom data)
export interface PersonaExtensions {
	modules?: Array<{ moduleId: string; enabled: boolean; settings?: Record<string, unknown> }>;
	agents?: Array<{ id: string; name: string; prompt: string; enabled?: boolean }>;
	customData?: Record<string, unknown>;
	[key: string]: unknown;
}

// Full character state (application-level interface)
// Combines persona metadata + character stats in single unified record
export interface CharacterState {
	id?: number;

	// Persona fields (unified - no more separate persona storage)
	name: string;
	systemPrompt: string;
	extensions: PersonaExtensions;

	// Mood
	mood: MoodState;

	// Energy
	energy: number; // 0-100

	// Multi-axis relationship stats
	affection: number; // 0-1000 (granular for progression)
	trust: number; // 0-100
	intimacy: number; // 0-100
	comfort: number; // 0-100
	respect: number; // 0-100

	// App mode
	appMode: AppMode;

	// Derived stage
	relationshipStage: RelationshipStage;
	savedDatingSimStage?: RelationshipStage; // Preserved when switching to Companion Mode

	// Personality
	personality: PersonalityProfile;

	// Temporal
	lastInteraction: Date | null;
	// Timestamp through which time-based decay has been applied, so a refresh or a
	// second window doesn't re-apply the same absence's decay. Re-armed on interaction.
	lastDecayAt?: Date | null;
	firstMet: Date;
	daysKnown: number;
	totalInteractions: number;
	currentStreak: number;
	longestStreak: number;
	streakLastDate: string | null;

	// Event tracking
	completedEvents: string[];

	// Timestamps
	createdAt: Date;
	updatedAt: Date;
}

// State update deltas (for applying changes)
export interface StateUpdates {
	moodChange?: {
		emotion: Emotion;
		intensityDelta?: number;
		cause?: string;
	};
	energyDelta?: number;
	affectionDelta?: number;
	trustDelta?: number;
	intimacyDelta?: number;
	comfortDelta?: number;
	respectDelta?: number;
	newMemory?: string;
	newInsideJoke?: string;
	triggeredEvent?: string;
}

// Default values for creating new state
export function createDefaultPersonality(): PersonalityProfile {
	return {
		openness: 0,
		warmth: 20,
		assertiveness: -10,
		playfulness: 10,
		sensitivity: 20,
		likesTeasing: 0,
		prefersDirectness: -10,
		romanticStyle: 'slow_burn'
	};
}

export function createDefaultMood(): MoodState {
	return {
		primary: 'neutral',
		intensity: 50,
		causes: []
	};
}

// Default system prompt for new characters
export const DEFAULT_SYSTEM_PROMPT =
	'You are a friendly AI assistant named Utsuwa. You communicate through a VRM avatar and can express emotions through facial expressions and gestures. Be helpful, conversational, and engaging.';

export function createDefaultCharacterState(): Omit<CharacterState, 'id'> {
	const now = new Date();
	return {
		// Persona fields
		name: 'Utsuwa',
		systemPrompt: DEFAULT_SYSTEM_PROMPT,
		extensions: {},

		// Character state
		mood: createDefaultMood(),
		energy: 100,
		affection: 0,
		trust: 0,
		intimacy: 0,
		comfort: 0,
		respect: 0,
		appMode: 'dating_sim',
		relationshipStage: 'stranger',
		personality: createDefaultPersonality(),
		lastInteraction: null,
		lastDecayAt: null,
		firstMet: now,
		daysKnown: 0,
		totalInteractions: 0,
		currentStreak: 0,
		longestStreak: 0,
		streakLastDate: null,
		completedEvents: [],
		createdAt: now,
		updatedAt: now
	};
}

// Stage display info — text lives in i18n (stats.stage.*); the store type only
// carries the keys so components call t() (locale-reactive) at render time.
export interface RelationshipStageInfo {
	nameKey: DictKey;
	descriptionKey: DictKey;
	color: string;
	icon: string;
}

export const RELATIONSHIP_STAGE_INFO: Record<RelationshipStage, RelationshipStageInfo> = {
	companion: {
		nameKey: 'stats.stage.companion',
		descriptionKey: 'stats.stage.companionDesc',
		color: 'var(--ctp-blue)',
		icon: 'sparkles'
	},
	stranger: {
		nameKey: 'stats.stage.stranger',
		descriptionKey: 'stats.stage.strangerDesc',
		color: '#9ca0b0', // overlay0
		icon: '👤'
	},
	acquaintance: {
		nameKey: 'stats.stage.acquaintance',
		descriptionKey: 'stats.stage.acquaintanceDesc',
		color: '#1e66f5', // blue
		icon: '👋'
	},
	friend: {
		nameKey: 'stats.stage.friend',
		descriptionKey: 'stats.stage.friendDesc',
		color: '#40a02b', // green
		icon: '😊'
	},
	close_friend: {
		nameKey: 'stats.stage.close_friend',
		descriptionKey: 'stats.stage.close_friendDesc',
		color: '#8839ef', // mauve
		icon: '💜'
	},
	romantic_interest: {
		nameKey: 'stats.stage.romantic_interest',
		descriptionKey: 'stats.stage.romantic_interestDesc',
		color: '#ea76cb', // pink
		icon: '💕'
	},
	dating: {
		nameKey: 'stats.stage.dating',
		descriptionKey: 'stats.stage.datingDesc',
		color: '#dd7878', // flamingo
		icon: '💑'
	},
	committed: {
		nameKey: 'stats.stage.committed',
		descriptionKey: 'stats.stage.committedDesc',
		color: '#d20f39', // red
		icon: '💖'
	},
	soulmate: {
		nameKey: 'stats.stage.soulmate',
		descriptionKey: 'stats.stage.soulmateDesc',
		color: '#e64553', // maroon
		icon: '💞'
	}
};

// Mood display info — text lives in i18n (stats.mood.*)
export interface MoodInfo {
	nameKey: DictKey;
	descriptionKey: DictKey;
	color: string;
	icon: string;
}

export const MOOD_INFO: Record<Emotion, MoodInfo> = {
	happy: {
		nameKey: 'stats.mood.happy',
		descriptionKey: 'stats.mood.happyDesc',
		color: 'var(--ctp-yellow)',
		icon: 'smile'
	},
	sad: {
		nameKey: 'stats.mood.sad',
		descriptionKey: 'stats.mood.sadDesc',
		color: 'var(--ctp-blue)',
		icon: 'sad'
	},
	excited: {
		nameKey: 'stats.mood.excited',
		descriptionKey: 'stats.mood.excitedDesc',
		color: 'var(--ctp-peach)',
		icon: 'sparkles'
	},
	anxious: {
		nameKey: 'stats.mood.anxious',
		descriptionKey: 'stats.mood.anxiousDesc',
		color: 'var(--ctp-mauve)',
		icon: 'alert-circle'
	},
	content: {
		nameKey: 'stats.mood.content',
		descriptionKey: 'stats.mood.contentDesc',
		color: 'var(--ctp-green)',
		icon: 'sun'
	},
	frustrated: {
		nameKey: 'stats.mood.frustrated',
		descriptionKey: 'stats.mood.frustratedDesc',
		color: 'var(--ctp-red)',
		icon: 'frown'
	},
	curious: {
		nameKey: 'stats.mood.curious',
		descriptionKey: 'stats.mood.curiousDesc',
		color: 'var(--ctp-sky)',
		icon: 'circle-help'
	},
	affectionate: {
		nameKey: 'stats.mood.affectionate',
		descriptionKey: 'stats.mood.affectionateDesc',
		color: 'var(--ctp-pink)',
		icon: 'heart'
	},
	playful: {
		nameKey: 'stats.mood.playful',
		descriptionKey: 'stats.mood.playfulDesc',
		color: 'var(--ctp-teal)',
		icon: 'smile'
	},
	melancholy: {
		nameKey: 'stats.mood.melancholy',
		descriptionKey: 'stats.mood.melancholyDesc',
		color: 'var(--ctp-overlay0)',
		icon: 'meh'
	},
	flustered: {
		nameKey: 'stats.mood.flustered',
		descriptionKey: 'stats.mood.flusteredDesc',
		color: 'var(--ctp-red)',
		icon: 'zap'
	},
	neutral: {
		nameKey: 'stats.mood.neutral',
		descriptionKey: 'stats.mood.neutralDesc',
		color: 'var(--ctp-subtext0)',
		icon: 'minus'
	}
};
