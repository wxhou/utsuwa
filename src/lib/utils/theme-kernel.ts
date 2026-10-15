// Theme kernel: dom-free decision logic. Plain .ts on purpose — the node test
// runner can't import $app environment proxies (see stt-chain.ts precedent).

export type UiTheme = 'default' | 'sakura' | 'ocean';

export const THEME_IDS: UiTheme[] = ['default', 'sakura', 'ocean'];

export const isKnownTheme = (raw: string | null | undefined): raw is UiTheme =>
	!!raw && (THEME_IDS as string[]).includes(raw);

export function normalizeTheme(raw: string | null | undefined): UiTheme {
	return isKnownTheme(raw) ? raw : 'default';
}
