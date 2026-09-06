import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
        // The app uses localStorage for config caching and publicKey for device identity.
        // We inject a demo key to bypass the unidentified-user state.
        storageState: {
            cookies: [],
            origins: [
                {
                    origin: 'http://localhost:3000',
                    localStorage: [{ name: 'PublicKey', value: 'test-e2e-device' }],
                },
            ],
        },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    // Playwright manages the dev server — starts it before tests and stops it after.
    webServer: {
        command: 'bun dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
    },
});
