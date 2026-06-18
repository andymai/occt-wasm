import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "test/browser",
    timeout: 60_000,
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
