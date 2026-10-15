import { defineConfig, devices } from '@playwright/test';
import net from 'node:net';

// Probe-and-close is racy in theory (another process could grab the port
// between here and the webServer start), but the failure is loud and BW_PORT
// always wins for deterministic runs.
function isPortFree(port: number): boolean {
	const s = net.createServer();
	try {
		s.listen(port, '127.0.0.1');
		return true;
	} catch {
		return false;
	} finally {
		s.close();
	}
}

function pickPort(): number {
	if (process.env.BW_PORT) return Number(process.env.BW_PORT);
	for (let p = 5188; p < 5188 + 8; p++) if (isPortFree(p)) return p;
	return 5188;
}

const PORT = pickPort();

export default defineConfig({
	testDir: './tests/browser',
	fullyParallel: false,
	workers: 1,
	reporter: 'list',
	// Hosted software rendering can stall DOM reads while compositing a frame.
	timeout: process.env.CI ? 90_000 : 45_000,
	expect: { timeout: process.env.CI ? 20_000 : 5_000 },
	//基线端口 5188；被占用时自动顺延（最多 +8），BW_PORT 显式指定时优先
	use: {
		baseURL: `http://127.0.0.1:${PORT}`,
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
		command: `pnpm dev --host 127.0.0.1 --port ${PORT}`,
		url: `http://127.0.0.1:${PORT}/app/settings/display`,
		env: { VITE_TEST_PORT: String(PORT) },
		reuseExistingServer: false
	}
});
