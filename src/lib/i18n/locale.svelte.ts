// Locale state — the only runes-dependent piece of i18n. $state works only in
// .svelte.ts/.svelte files, so index.ts keeps pure logic and imports from here.

import { browser } from '$app/environment';
import { detectLocale, isSupportedLocale, type Locale } from './locale-kernel';

export type { Locale } from './locale-kernel';
export const LOCALES = ['en', 'zh-CN'] as const;

const STORAGE_KEY = 'utsuwa.locale';

let current = $state<Locale>('en');

function parseLocale(value: unknown): Locale | null {
	return isSupportedLocale(value) ? value : null;
}

function readStoredLocale(): Locale {
	if (!browser) return 'en';
	const stored = parseLocale(localStorage.getItem(STORAGE_KEY));
	// No explicit choice: follow the browser's language preference, en as the
	// last resort. navigator.languages is ordered by the user's preference.
	return stored ?? detectLocale(navigator.languages ?? [navigator.language]);
}

function persist() {
	if (browser) {
		localStorage.setItem(STORAGE_KEY, current);
	}
}

if (browser) {
	current = readStoredLocale();
	document.documentElement.lang = current;
	// Live-follow changes made in other windows (desktop overlay, second tab).
	window.addEventListener('storage', (event) => {
		if (event.key === STORAGE_KEY && event.newValue !== null) {
			const next = parseLocale(event.newValue);
			if (next) current = next;
		}
	});
}

// Read as a function so callers inside component templates/$derived subscribe
// to this module's $state.
export function currentLocale(): Locale {
	return current;
}

export function setLocale(next: Locale) {
	current = next;
	persist();
	if (browser) {
		document.documentElement.lang = next;
	}
}

export const localeKey = STORAGE_KEY;
