import { test, expect } from "@playwright/test";

test("WASM loads and basic operations work in the browser", async ({ page }) => {
    // Serve the test page
    await page.goto("http://localhost:3000/test/browser/index.html");

    // Wait for WASM to load and tests to complete
    const result = await page.waitForSelector("#result", { timeout: 30_000 });
    const text = await result.textContent();

    // Verify all checks passed
    expect(text).toContain("ALL PASSED");
});
