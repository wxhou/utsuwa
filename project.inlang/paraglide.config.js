import { defineConfig } from '@inlang/paraglide-js';

// Read by both the Vite plugin and `paraglide-js compile`, so every build and
// `pnpm check` generates the same runtime. Only the landing page is localized
// so far (/zh-CN); every other path stays English and unprefixed.
// inlang's generated .gitignore in this folder hides everything except
// settings.json, so this file was added with `git add -f`.
export default defineConfig({
	strategy: ['url', 'baseLocale'],
	urlPatterns: [
		{ pattern: '/', localized: [['zh-CN', '/zh-CN'], ['en', '/']] },
		{ pattern: '/:path(.*)?', localized: [['en', '/:path(.*)?']] }
	]
});
