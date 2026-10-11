// Pure translation core: no runes, no SvelteKit aliases — works under
// node --test and in the app alike. index.ts wraps it with the live locale.
import { en, type DictKey } from './locales/en.ts';
import { zhCN } from './locales/zh-CN.ts';
import type { Locale } from './types.ts';

// Both dictionaries are flattened into plain `dotted.key -> text` maps.
type FlatDict = Record<string, string>;

// A {name} placeholder in a dictionary value.
const PARAM_PATTERN = /\{(\w+)\}/g;

function flatten(source: unknown, prefix: string, out: FlatDict) {
	for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === 'string') out[path] = value;
		else flatten(value, path, out);
	}
}

function buildFlat(source: unknown): FlatDict {
	const out: FlatDict = {};
	flatten(source, '', out);
	return out;
}

const DICTS: Record<Locale, FlatDict> = {
	en: buildFlat(en),
	'zh-CN': zhCN
};

function lookup(locale: Locale, key: string): string {
	// zh falls back to en per spec; a key missing from both renders as ''.
	return DICTS[locale][key] ?? DICTS.en[key] ?? '';
}

export function translate(locale: Locale, key: DictKey, params?: Record<string, string | number>): string {
	const finalKey = params && 'n' in params ? replaceLeafSuffix(key, Number(params.n)) : key;
	let text = lookup(locale, finalKey);
	if (params) {
		text = text.replace(PARAM_PATTERN, (_match, name: string) =>
			name in params ? String(params[name]) : `{${name}}`
		);
	}
	return text;
}

function leafExists(locale: Locale, fullKey: string): boolean {
	return typeof DICTS[locale][fullKey] === 'string';
}

// Plural convention on the leaf: `memory.memoriesCount` + n → `…_one/_other`.
// Opt-in: only swaps the suffix when the variant key exists in a dictionary;
// keys without plural variants keep the plain key.
function replaceLeafSuffix(key: string, n: number): string {
	const dot = key.lastIndexOf('.');
	const leaf = dot === -1 ? key : key.slice(dot + 1);
	const category = n === 1 ? 'one' : 'other';
	const nextLeaf = leaf.replace(/_(one|other)$/, '') + `_${category}`;
	const stripped = dot === -1 ? nextLeaf : `${key.slice(0, dot)}.${nextLeaf}`;
	return leafExists('en', stripped) || leafExists('zh-CN', stripped) ? stripped : key;
}
