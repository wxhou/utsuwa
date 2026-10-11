// Locale state — the only runes-dependent piece of i18n. $state works only in
// .svelte.ts/.svelte files, so index.ts keeps pure logic and imports from here.

export type Locale = 'en' | 'zh-CN';

export const LOCALES: Locale[] = ['en', 'zh-CN'];

const STORAGE_KEY = 'utsuwa.locale';

let current = $state<Locale>('en');

function parseLocale(value: unknown): Locale | null {
	return LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

function readStoredLocale(): Locale {
	if (!browser) return 'en';
	const stored = parseLocale(localStorage.getItem(STORAGE_KEY));
	return stored ?? 'en';
}

function persist() {
	if (browser) {
		localStorage.setItem(STORAGE_KEY, current);
	}
}

// Needs the shared browser guard; imported rather than inlined to keep a
// single source of truth for SSR detection.
import { browser } from '$app/environment';

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
