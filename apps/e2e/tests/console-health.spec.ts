import { test, expect } from "./fixtures.js";

/**
 * E2E tests for baseline console health.
 *
 * Verifies that:
 * 1. No 404s for favicon or PWA assets
 * 2. No uncaught JS exceptions on initial render
 * 3. Both admin and portal pages load cleanly
 */

test.describe("Console Health", () => {
  const consoleErrors: string[] = [];
  const failedRequests: { url: string; status: number }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    failedRequests.length = 0;

    // Capture console errors
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Capture failed requests (404s, etc)
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedRequests.push({ url: response.url(), status: response.status() });
      }
    });
  });

  test("admin page loads without 404s for favicon/PWA assets", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    // Wait for page to fully load
    await page.waitForLoadState("networkidle");

    // Check for 404s on favicon or PWA assets
    const assetFailures = failedRequests.filter(
      ({ url }) =>
        url.includes("favicon") ||
        url.includes("manifest") ||
        url.includes("sw.js") ||
        url.includes("pwa") ||
        url.includes(".ico")
    );

    expect(assetFailures).toHaveLength(0);
  });

  test("portal page loads without 404s for favicon/PWA assets", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("http://localhost:8080/");

    // Wait for page to fully load
    await page.waitForLoadState("networkidle");

    // Check for 404s on favicon or PWA assets
    const assetFailures = failedRequests.filter(
      ({ url }) =>
        url.includes("favicon") ||
        url.includes("manifest") ||
        url.includes("sw.js") ||
        url.includes("pwa") ||
        url.includes(".ico")
    );

    expect(assetFailures).toHaveLength(0);
  });

  test("admin page has no uncaught JS exceptions on initial render", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    // Wait for initial render
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors (e.g., third-party scripts)
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes("favicon") &&
        !err.includes("third-party") &&
        !err.includes("ResizeObserver") // Browser-specific, non-critical
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("portal page has no uncaught JS exceptions on initial render", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("http://localhost:8080/");

    // Wait for initial render
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Filter out known non-critical errors
    const criticalErrors = consoleErrors.filter(
      (err) =>
        !err.includes("favicon") &&
        !err.includes("third-party") &&
        !err.includes("ResizeObserver")
    );

    expect(criticalErrors).toHaveLength(0);
  });

  test("no failed requests on initial page load (admin)", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    await page.waitForLoadState("networkidle");

    // No 4xx/5xx responses (except ignored cases)
    const criticalFailures = failedRequests.filter(
      ({ url, status }) =>
        status >= 400 &&
        !url.includes("favicon") &&
        !url.includes("/api/dev/") // Dev endpoints may return 404 in some configs
    );

    expect(criticalFailures).toHaveLength(0);
  });
});
