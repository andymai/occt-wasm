import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "test/browser",
    timeout: 60_000,
    use: {
        browserName: "chromium",
    },
    webServer: {
        command: "npx serve . -l 3000 --no-clipboard",
        port: 3000,
        reuseExistingServer: true,
    },
});
