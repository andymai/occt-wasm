import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "test/browser",
    // 90s leaves headroom above the 50s in-page WASM-compile wait (smoke.spec.ts)
    // for page.goto + assertions on a cold, loaded CI runner.
    timeout: 90_000,
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        // Firefox 121+ ships WASM tail calls, the build's binding requirement.
        { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    ],
    webServer: {
        command: "npx serve . -l 3000 --no-clipboard",
        port: 3000,
        reuseExistingServer: true,
    },
});
