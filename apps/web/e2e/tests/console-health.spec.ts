import { test, expect } from "./fixtures.js";

/**
 * E2E test: Baseline Console Health (GRO-306)
 *
 * Verifies baseline console health on initial page load for both
 * admin and portal views:
 * - No 404s for favicon or PWA assets
 * - No uncaught JS exceptions on initial render
 *
 * This test runs against current dev state (no GRO-300 dependency).
 */
test.describe("Baseline Console Health", () => {
  test("admin page has no console errors on initial load", async ({
    staffPage,
  }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];

    staffPage.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    staffPage.on("requestfailed", (request) => {
      const url = request.url();
      // Only care about asset failures, not API failures (which may be expected in dev)
      if (
        url.includes("favicon") ||
        url.includes(".ico") ||
        url.includes("manifest") ||
        url.includes(".js") ||
        url.includes(".css") ||
        url.includes(".png") ||
        url.includes(".svg")
      ) {
        failedRequests.push(`${request.failure()?.errorText} — ${url}`);
      }
    });

    await staffPage.goto("/admin");
    await staffPage.waitForLoadState("networkidle");

    // Filter out non-critical errors
    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("net::ERR_") &&
        !e.includes("Failed to load resource")
    );

    expect(criticalErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test("portal page has no console errors on initial load", async ({
    clientPage,
  }) => {
    const errors: string[] = [];
    const failedRequests: string[] = [];

    clientPage.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });

    clientPage.on("requestfailed", (request) => {
      const url = request.url();
      if (
        url.includes("favicon") ||
        url.includes(".ico") ||
        url.includes("manifest") ||
        url.includes(".js") ||
        url.includes(".css") ||
        url.includes(".png") ||
        url.includes(".svg")
      ) {
        failedRequests.push(`${request.failure()?.errorText} — ${url}`);
      }
    });

    await clientPage.goto("/");
    await clientPage.waitForLoadState("networkidle");

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes("favicon") &&
        !e.includes("net::ERR_") &&
        !e.includes("Failed to load resource")
    );

    expect(criticalErrors).toHaveLength(0);
    expect(failedRequests).toHaveLength(0);
  });

  test("no 404s for favicon or PWA assets", async ({ staffPage }) => {
    const notFound: string[] = [];

    staffPage.on("response", (response) => {
      const status = response.status();
      const url = response.url();
      if (
        status === 404 &&
        (url.includes("favicon") ||
          url.includes(".ico") ||
          url.includes("manifest") ||
          url.includes("sw.js") ||
          url.includes("workbox"))
      ) {
        notFound.push(url);
      }
    });

    await staffPage.goto("/admin");
    await staffPage.waitForLoadState("networkidle");

    expect(notFound).toHaveLength(0);
  });
});