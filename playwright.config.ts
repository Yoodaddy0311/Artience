import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:5173',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'pnpm dev:desktop',
        port: 5173,
        reuseExistingServer: true,
        timeout: 60000,
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
});
