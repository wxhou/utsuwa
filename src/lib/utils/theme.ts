import { browser } from '$app/environment';
import { STORAGE_INVENTORY } from '$lib/db/storage-inventory';
import { normalizeTheme, type UiTheme } from './theme-kernel';

// UI accent themes, orthogonal to light/dark (color-mode.ts owns that
// switch). A theme is a data-theme attribute the CSS variable groups in
// app-theme.css key off; 'default' means "no attribute" so the base
// stylesheet values stand and rollback is structural.
export { THEME_IDS, normalizeTheme, type UiTheme } from './theme-kernel';

export function getTheme(): UiTheme {
	if (!browser) return 'default';
	return normalizeTheme(localStorage.getItem(STORAGE_INVENTORY.localStorage.uiTheme));
}

export function applyTheme(theme: UiTheme) {
	if (!browser) return;
	if (theme === 'default') {
		document.documentElement.removeAttribute('data-theme');
	} else {
		document.documentElement.setAttribute('data-theme', theme);
	}
}

export function setTheme(theme: UiTheme) {
	if (!browser) return;
	localStorage.setItem(STORAGE_INVENTORY.localStorage.uiTheme, theme);
	applyTheme(theme);
}
