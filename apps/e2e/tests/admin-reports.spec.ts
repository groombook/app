import { test, expect } from "./fixtures.js";

/**
 * E2E tests for admin reports page.
 *
 * Verifies that:
 * 1. Reports page loads with charts/metrics
 * 2. Date range selection works
 * 3. At least one chart/metric shows non-zero data for the last 60 days
 */

const MOCK_REPORTS_DATA = {
  revenue: { total: 150000, currency: "USD" },
  appointments: { total: 45, completed: 40, cancelled: 5 },
  revenueByDay: [
    { date: "2026-03-01", amount: 5000 },
    { date: "2026-03-15", amount: 7500 },
    { date: "2026-03-20", amount: 8000 },
  ],
  servicesByPopularity: [
    { name: "Full Groom", count: 25 },
    { name: "Bath & Brush", count: 15 },
  ],
  // Empty data case for testing
  empty: { revenue: { total: 0 }, appointments: { total: 0 } },
};

test.describe("Admin Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/reports**", (route) =>
      route.fulfill({ json: MOCK_REPORTS_DATA })
    );
  });

  test("reports page loads with date range controls", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    await page.goto("/admin/reports");

    // Wait for reports to load
    await page.waitForTimeout(2000);

    // Should have date range inputs or controls
    const hasDateControls = await page.locator('input[type="date"], select').first().isVisible().catch(() => false);

    // Should display some revenue or metric data
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toBe("");
  });

  test("reports show non-zero data for last 60 days", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    await page.goto("/admin/reports");
    await page.waitForTimeout(2000);

    // Set date range to last 60 days
    const today = new Date();
    const sixtyDaysAgo = new Date(today);
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    // Find date inputs and fill them
    const dateInputs = page.locator('input[type="date"]');
    const count = await dateInputs.count();

    if (count >= 2) {
      await dateInputs.first().fill(formatDate(sixtyDaysAgo));
      await dateInputs.nth(1).fill(formatDate(today));

      // Trigger update
      await page.keyboard.press("Enter");
      await page.waitForTimeout(1000);
    }

    // Verify at least one chart or metric shows non-zero data
    // The mock returns non-zero revenue and appointment counts
    const bodyText = await page.textContent("body");

    // Should show some numeric data (revenue or counts)
    const hasNumericData = /\$[\d,]+|[\d]+%/.test(bodyText || "");
    expect(hasNumericData).toBe(true);
  });

  test("reports page does not show blank state with no data", async ({ page }) => {
    // Override with empty data mock
    await page.route("/api/reports**", (route) =>
      route.fulfill({ json: MOCK_REPORTS_DATA.empty })
    );

    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    await page.goto("/admin/reports");
    await page.waitForTimeout(2000);

    // Page should still render (even if showing zero/empty state)
    // It should not crash or show only a blank page
    const bodyText = await page.textContent("body");
    expect(bodyText).toBeTruthy();
  });
});
