// Dictionary consistency gate — see OpenSpec change settings-i18n-completion.
//
// Coverage scope of the hardcoded-text scan is directory-based: every
// .svelte file under SCAN_ROOTS is checked automatically, plus the files in
// EXTRA_FILES. New settings components are picked up by default (directory
// coverage); a file that must stay exempt needs an entry here with a reason.
// To bring another area (main UI, chat window, overlay) under the scan, add
// its directory to SCAN_ROOTS or its files to EXTRA_FILES — the exemption
// list below then has to cover that area's legitimate literals too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { en } from './locales/en.ts';
import { zhCN } from './locales/zh-CN.ts';

function leafKeys(source: Record<string, unknown>, prefix = ''): string[] {
	return Object.entries(source).flatMap(([key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		return value && typeof value === 'object'
			? leafKeys(value as Record<string, unknown>, path)
			: [path];
	});
}

test('every English key has a non-empty Chinese translation', () => {
	const missing = leafKeys(en).filter((key) => !(key in zhCN) || zhCN[key as keyof typeof zhCN] === '');
	assert.deepEqual(missing, [], `keys missing from zh-CN: ${missing.join(', ')}`);
});

test('Chinese dictionary has no orphan or empty entries', () => {
	const english = new Set(leafKeys(en));
	const orphans = Object.keys(zhCN).filter((key) => !english.has(key));
	assert.deepEqual(orphans, [], `zh-CN keys not present in en: ${orphans.join(', ')}`);
	const empty = Object.keys(zhCN).filter((key) => zhCN[key as keyof typeof zhCN] === '');
	assert.deepEqual(empty, [], `empty zh-CN entries: ${empty.join(', ')}`);
});

// --- Hardcoded visible-text scan -------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

const SCAN_ROOTS = [
	'src/routes/app/settings',
	'src/lib/components/settings',
	'src/lib/components/memory'
];

const EXTRA_FILES = [
	'src/lib/components/ui/InfoModal.svelte',
	'src/lib/components/ui/ModelDropdown.svelte',
	'src/lib/components/ui/ProviderDropdown.svelte',
	'src/lib/components/ui/ContextSizeSlider.svelte'
];

// Visible literals that are not UI copy. Every entry needs a reason; prefer
// a dictionary key over adding to this list.
const EXEMPT_TEXT = new Set([
	'esc', // keyboard key name shown on the back hint
	's', // seconds unit next to the wake delay stepper
	'Utsuwa', // brand name (logo aria-label)
	'SenseVoiceSmall', // SiliconFlow default STT model id as placeholder
	'http://localhost:8000/v1/', // local STT endpoint example (placeholder + aria)
	'Home Assistant', // MCP server name example (placeholder)
	'http://homeassistant.local:8123/api/mcp', // MCP endpoint example (placeholder)
	'npx', // MCP command example (placeholder)
	'-y mcp-searxng', // MCP args example (placeholder)
	'SEARXNG_URL=http://your-searxng-host:8080', // MCP env example (placeholder)
	'HTTP', // transport protocol name
	'stdio', // transport protocol name
	'auth', // server metadata badge (bearer-auth state)
	'auto-run' // server metadata badge (ask-before-run off)
]);

const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const INTERPOLATION = /\{[^{}]*\}/g;
const SCANNABLE_ATTR =
	/\b(?:aria-label|title|placeholder|alt|label|description)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const HAS_LATIN = /[A-Za-z]/;
const HAS_CJK = /[一-鿿]/;

function listSvelteFiles(root: string): string[] {
	const out: string[] = [];
	const visit = (dir: string) => {
		for (const entry of readdirSync(dir).sort()) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) visit(full);
			else if (entry.endsWith('.svelte')) out.push(full);
		}
	};
	visit(root);
	return out;
}

function visibleLiterals(source: string): string[] {
	let text = source.replace(SCRIPT_OR_STYLE, ' ').replace(HTML_COMMENT, ' ');
	// Repeat: expressions may contain nested braces (`{#snippet child({ props })}`).
	let previous;
	do {
		previous = text;
		text = text.replace(INTERPOLATION, ' ');
	} while (text !== previous);

	const literals: string[] = [];
	for (const match of text.matchAll(SCANNABLE_ATTR)) {
		const value = (match[1] ?? match[2] ?? '').replace(/\s+/g, ' ').trim();
		if (value) literals.push(value);
	}
	for (const node of text.split(/<[^>]*>/)) {
		const value = node.replace(/\s+/g, ' ').trim();
		if (value) literals.push(value);
	}
	return literals;
}

test('scanned settings surfaces contain no hardcoded visible English', () => {
	const files = [
		...SCAN_ROOTS.flatMap((dir) => listSvelteFiles(join(REPO_ROOT, dir))),
		...EXTRA_FILES.map((file) => join(REPO_ROOT, file))
	];
	assert.ok(files.length > 0, 'scan coverage resolved to zero files');

	const offenders: string[] = [];
	for (const file of files) {
		for (const literal of visibleLiterals(readFileSync(file, 'utf8'))) {
			if (!HAS_LATIN.test(literal)) continue; // numbers, units, symbols
			if (HAS_CJK.test(literal)) continue; // already localized
			if (EXEMPT_TEXT.has(literal)) continue;
			offenders.push(`${file.replace(REPO_ROOT, '')}: ${JSON.stringify(literal)}`);
		}
	}
	assert.deepEqual(
		offenders,
		[],
		`hardcoded visible text outside the dictionary:\n${offenders.join('\n')}`
	);
});
