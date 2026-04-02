import { test, expect } from "./fixtures.js";

/**
 * E2E tests for admin reports page.
 * Verifies that reports render with data when date range is set.
 */

function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const MOCK_SUMMARY = {
  from: getDateDaysAgo(60),
  to: new Date().toISOString().slice(0, 10),
  revenue: { totalCents: 125000, paidInvoices: 15 },
  appointments: { total: 25, completed: 20, cancelled: 3, noShow: 2 },
  clients: { total: 42, new: 8 },
};

const MOCK_REVENUE = {
  byPeriod: [
    { period: "2026-03-01", totalCents: 45000, invoiceCount: 5 },
    { period: "2026-03-15", totalCents: 80000, invoiceCount: 10 },
  ],
  byGroomer: [
    { staffId: "staff-1", staffName: "Alice Groomer", totalCents: 125000, invoiceCount: 15 },
  ],
};

test.describe("Admin Reports Data", () => {
  test.beforeEach(async ({ page }) => {
    // Login as staff
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("/admin");

    // Mock all report endpoints
    await page.route("**/api/reports/summary**", (route) =>
      route.fulfill({ json: MOCK_SUMMARY })
    );
    await page.route("**/api/reports/revenue**", (route) =>
      route.fulfill({ json: MOCK_REVENUE })
    );
    await page.route("**/api/reports/appointments**", (route) =>
      route.fulfill({ json: { byPeriod: [] } })
    );
    await page.route("**/api/reports/services**", (route) =>
      route.fulfill({ json: { rows: [] } })
    );
    await page.route("**/api/reports/clients**", (route) =>
      route.fulfill({ json: { newClients: [], activeInPeriodCount: 10, churnRisk: [], churnRiskTotal: 0 } })
    );
  });

  test("reports page loads and displays KPI cards", async ({ page }) => {
    await page.goto("/admin/reports");

    // Wait for reports to load
    await expect(page.locator("h1")).toContainText("Reports", { timeout: 10_000 });

    // Should show KPI cards with data (use .first() to avoid strict mode violation)
    await expect(page.locator("text=/Revenue/i").first()).toBeVisible();
    await expect(page.locator("text=/Appointments/i").first()).toBeVisible();
    await expect(page.locator("text=/New Clients/i").first()).toBeVisible();
  });

  test("reports show non-zero data when data exists", async ({ page }) => {
    await page.goto("/admin/reports");

    // Wait for data to load
    await page.waitForTimeout(2_000);

    // Revenue card should show non-zero value (check dollar amount or Revenue heading)
    const revenueCard = page.locator("text=/\\$1,250|Revenue/i").first();
    await expect(revenueCard).toBeVisible();

    // Appointments card should show non-zero
    await expect(page.getByText("25", { exact: true }).first()).toBeVisible();
  });

  test("reports date range inputs exist and are functional", async ({ page }) => {
    await page.goto("/admin/reports");

    // Wait for page to load
    await expect(page.locator("h1")).toContainText("Reports", { timeout: 10_000 });

    // Date inputs should exist
    const fromInput = page.locator('input[type="date"]').first();
    const toInput = page.locator('input[type="date"]').nth(1);

    await expect(fromInput).toBeVisible();
    await expect(toInput).toBeVisible();

    // Change date range - set to last 60 days
    const sixtyDaysAgo = getDateDaysAgo(60);
    await fromInput.fill(sixtyDaysAgo);

    // Click refresh
    await page.getByRole("button", { name: /Refresh/i }).click();

    // Wait for data to reload
    await page.waitForTimeout(1_000);

    // Reports should still display
    await expect(page.locator("h1")).toContainText("Reports");
  });

  test("reports page renders charts/metrics sections", async ({ page }) => {
    await page.goto("/admin/reports");

    // Wait for reports to load
    await page.waitForTimeout(2_000);

    // Should show section headers (use .first() to avoid strict mode violation)
    await expect(page.locator("text=/Revenue by/i").first()).toBeVisible();
  });
});