import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	timeout: 45_000,
	//基线端口 5188；被外部进程占用时用 BW_PORT 指到空闲端口，避免改配置
	use: {
		baseURL: `http://127.0.0.1:${process.env.BW_PORT ?? 5188}`,
		// Keep DOM/action traces without continuously recording the animated 3D canvas.
		// Visual review screenshots are captured explicitly by the tests.
		trace: { mode: 'retain-on-failure', screenshots: false }
	},
	projects: [
		{
			name: 'desktop',
			use: {
				...devices['Desktop Chrome'],
				// Hosted runners have no GPU. Use the software backend we exercise locally.
				launchOptions: process.env.CI
					? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
					: undefined
			}
		},
		{ name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } }
	],
	webServer: {
		command: `pnpm dev --host 127.0.0.1 --port ${process.env.BW_PORT ?? 5188}`,
		url: `http://127.0.0.1:${process.env.BW_PORT ?? 5188}/app/settings/display`,
		env: { VITE_TEST_PORT: String(process.env.BW_PORT ?? 5188) },
		reuseExistingServer: false
	}
});
