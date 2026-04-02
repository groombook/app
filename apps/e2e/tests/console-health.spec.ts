import { test, expect } from "./fixtures.js";

/**
 * E2E tests for baseline console health.
 * Verifies no 404s for critical assets and no JS exceptions on initial render.
 */

test.describe("Console Health", () => {
  test("admin page loads without 404s or JS errors", async ({ page }) => {
    const consoleMessages: { type: string; text: string }[] = [];
    const failedRequests: string[] = [];

    // Capture console messages
    page.on("console", (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    // Capture failed requests
    page.on("requestfailed", (request) => {
      failedRequests.push(request.url());
    });

    // Navigate to admin
    await page.goto("/admin");

    // Wait for initial render
    await page.waitForLoadState("networkidle");

    // Check no 404s for critical assets
    const criticalAssetFailures = failedRequests.filter(
      (url) =>
        url.includes("favicon") ||
        url.includes("manifest") ||
        url.includes(".js") ||
        url.includes(".css") ||
        url.includes(".png") ||
        url.includes(".svg")
    );

    expect(
      criticalAssetFailures,
      `Critical asset 404s found: ${criticalAssetFailures.join(", ")}`
    ).toHaveLength(0);

    // Check no JS exceptions
    const jsErrors = consoleMessages.filter(
      (m) => m.type === "error" && !m.text.includes("favicon")
    );

    expect(jsErrors, `JS errors found: ${JSON.stringify(jsErrors)}`).toHaveLength(0);
  });

  test("portal page loads without 404s or JS errors", async ({ page }) => {
    const consoleMessages: { type: string; text: string }[] = [];
    const failedRequests: string[] = [];

    page.on("console", (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });

    page.on("requestfailed", (request) => {
      failedRequests.push(request.url());
    });

    // Login as client first
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("/");

    // Wait for initial render
    await page.waitForLoadState("networkidle");

    // Check no 404s for critical assets
    const criticalAssetFailures = failedRequests.filter(
      (url) =>
        url.includes("favicon") ||
        url.includes("manifest") ||
        url.includes(".js") ||
        url.includes(".css") ||
        url.includes(".png") ||
        url.includes(".svg")
    );

    expect(
      criticalAssetFailures,
      `Critical asset 404s found: ${criticalAssetFailures.join(", ")}`
    ).toHaveLength(0);

    // Check no JS exceptions
    const jsErrors = consoleMessages.filter(
      (m) => m.type === "error" && !m.text.includes("favicon") && !m.text.includes("502") && !m.text.includes("Failed to load resource")
    );

    expect(jsErrors, `JS errors found: ${JSON.stringify(jsErrors)}`).toHaveLength(0);
  });

  test("no uncaught exceptions on page load", async ({ page }) => {
    const jsErrors: string[] = [];

    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");

    expect(jsErrors, `Uncaught exceptions: ${jsErrors.join(", ")}`).toHaveLength(0);
  });

  test("portal dashboard renders without uncaught exceptions", async ({ page }) => {
    const jsErrors: string[] = [];

    page.on("pageerror", (error) => {
      jsErrors.push(error.message);
    });

    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("/");
    await page.waitForLoadState("domcontentloaded");

    expect(jsErrors, `Uncaught exceptions: ${jsErrors.join(", ")}`).toHaveLength(0);
  });
});