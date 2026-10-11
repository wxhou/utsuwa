// App-facing i18n entry: pure core.ts + live locale from the runes store.
// Call t() from component templates or $derived only — a plain .ts caller
// keeps a stale snapshot after a locale switch.
import type { DictKey } from './locales/en.ts';
import { translate } from './core.ts';
import { currentLocale } from './locale.svelte.ts';

export type { Locale } from './types.ts';
export { currentLocale, setLocale, LOCALES } from './locale.svelte.ts';

export function t(key: DictKey, params?: Record<string, string | number>): string {
	return translate(currentLocale(), key, params);
}
