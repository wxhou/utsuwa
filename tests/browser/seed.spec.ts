import { test } from '@playwright/test';

// Compute the onboarding-complete character record in the page, from the app's
// own modules, so the seed can't drift from saveCharacterState's schema.
const seedScript = `
	import('/src/lib/engine/character-defaults.ts')
		.then(({ createDefaultCharacterState }) =>
			import('/src/lib/services/storage/character.ts').then(({ saveCharacterState }) =>
				saveCharacterState({
					...createDefaultCharacterState(),
					// lastInteraction set = "user has been here", which is what gates
					// the first-run onboarding modal in src/routes/app/+page.svelte
					lastInteraction: new Date()
				})
			)
		);
`;

test.describe('Test group', () => {
	test('seed', async ({ page }) => {
		// Playwright contexts force colorScheme: 'light' by default, which lies
		// about the real system preference; clear it so the app follows the OS.
		await page.emulateMedia({ colorScheme: null });
		await page.goto('/');
		await page.evaluate(seedScript);
	});
});
