// Locale kernels: pure decision logic, no $app/dom. Plain .ts so node --test
// can import it directly (stt-chain / theme-kernel precedent).
import type { Locale } from './types';

export type { Locale };

export const SUPPORTED: Locale[] = ['en', 'zh-CN'];

export function isSupportedLocale(value: unknown): value is Locale {
	return SUPPORTED.includes(value as Locale);
}

// First supported locale among the browser's ordered preference list. en is
// our only English locale, so regional variants (en-GB) map to en; zh
// dialects with a region prefix (zh-TW/zh-HK) stay untranslated (exact match
// only) so they keep English rather than silently seeing simplified Chinese.
export function detectLocale(candidates: readonly string[]): Locale {
	for (const tag of candidates) {
		if (!tag) continue;
		const base = tag.toLowerCase();
		if (base === 'zh-cn' || base === 'zh-hans') return 'zh-CN';
		if (SUPPORTED.includes(tag.toLowerCase() as Locale)) return tag.toLowerCase() as Locale;
		if (base === 'en' || base.startsWith('en-')) return 'en';
	}
	return 'en';
}
