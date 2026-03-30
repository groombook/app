import { test, expect } from "./fixtures.js";

/**
 * E2E test: Reports Data (GRO-306)
 *
 * Verifies that the reports page loads with non-zero data when date range
 * is set to the last 60 days.
 *
 * This test runs against current dev state (no GRO-300 dependency).
 */
test.describe("Admin Reports Data", () => {
  test("reports page shows non-zero data for last 60 days", async ({
    staffPage,
  }) => {
    await staffPage.goto("/admin/reports");
    await staffPage.waitForLoadState("networkidle");

    // Wait for reports to load
    await expect(staffPage.getByText("Reports")).toBeVisible({ timeout: 10000 });

    // Calculate 60 days ago date
    const today = new Date();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);

    const formatDate = (d: Date) => d.toISOString().slice(0, 10);

    // Set the date range to last 60 days
    // The page has "From" and "To" date inputs
    const fromInput = staffPage.locator('input[type="date"]').first();
    const toInput = staffPage.locator('input[type="date"]').nth(1);

    await fromInput.fill(formatDate(sixtyDaysAgo));
    await toInput.fill(formatDate(today));

    // Click Refresh to reload the report
    await staffPage.getByRole("button", { name: /refresh/i }).click();

    // Wait for data to reload
    await staffPage.waitForLoadState("networkidle");
    await staffPage.waitForTimeout(1000);

    // At least one StatCard should show non-zero data
    // The StatCards show: Revenue, Appointments, No-shows, Cancellations, New Clients
    // We look for any card where the main value is not "0" or "$0.00"
    const statCardValues = staffPage.locator('[style*="fontSize: 26"]');
    const count = await statCardValues.count();
    expect(count).toBeGreaterThan(0);

    const hasNonZero = await staffPage.evaluate(() => {
      const cards = document.querySelectorAll('[style*="fontSize: 26"]');
      for (const card of Array.from(cards)) {
        const text = card.textContent?.trim() ?? "";
        // Check if it's a non-zero value
        if (text !== "0" && text !== "$0.00") {
          return true;
        }
      }
      return false;
    });

    expect(hasNonZero).toBeTruthy();
  });
});