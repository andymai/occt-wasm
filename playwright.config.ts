import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "test/browser",
    // 90s leaves headroom above the 50s in-page WASM-compile wait (smoke.spec.ts)
    // for page.goto + assertions on a cold, loaded CI runner.
    timeout: 90_000,
    projects: [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        // Firefox 121+ ships WASM tail calls, the build's binding requirement.
        {
            name: "firefox",
            use: {
                ...devices["Desktop Firefox"],
                // Chromium falls back to SwiftShader, but Firefox exposes WebGL
                // only against a real display — headless it hands back a null
                // context, and the demos die constructing their renderer. CI
                // runs under xvfb-run, which provides one; DISPLAY is how we
                // tell. Without it, stay headless and let the demo specs skip.
                headless: !process.env["DISPLAY"],
                launchOptions: {
                    firefoxUserPrefs: {
                        "webgl.force-enabled": true,
                        "webgl.forbid-software": false,
                    },
                },
            },
        },
    ],
    webServer: {
        command: "npx serve . -l 3000 --no-clipboard",
        port: 3000,
        reuseExistingServer: true,
    },
});
