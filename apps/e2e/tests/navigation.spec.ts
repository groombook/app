import { test, expect } from "./fixtures.js";

/**
 * Navigation smoke tests — verifies that each page loads without errors.
 * These tests mock all API calls so they can run without a live backend.
 */

test.beforeEach(async ({ page }) => {
  // Intercept all API calls and return empty defaults so pages render.
  // Reports endpoints need shaped responses (not bare []) to avoid render crashes.
  await page.route("/api/**", (route) => {
    const url = route.request().url();
    if (url.includes("/api/dev/config")) {
      return route.fulfill({ json: { authDisabled: true } });
    }
    if (url.includes("/api/dev/users")) {
      return route.fulfill({ json: { staff: [], clients: [] } });
    }
    if (url.includes("/api/branding")) {
      return route.fulfill({ json: { businessName: "GroomBook", logoUrl: null, theme: "default" } });
    }
    if (url.includes("/api/reports/summary")) {
      return route.fulfill({
        json: {
          from: "",
          to: "",
          revenue: { totalCents: 0, paidInvoices: 0 },
          appointments: { total: 0, completed: 0, cancelled: 0, noShow: 0 },
          clients: { total: 0, new: 0 },
        },
      });
    }
    if (url.includes("/api/reports/revenue")) {
      return route.fulfill({ json: { byPeriod: [], byGroomer: [] } });
    }
    if (url.includes("/api/reports/appointments")) {
      return route.fulfill({ json: { byPeriod: [] } });
    }
    if (url.includes("/api/reports/services")) {
      return route.fulfill({ json: { rows: [] } });
    }
    if (url.includes("/api/reports/clients")) {
      return route.fulfill({
        json: { newClients: [], activeInPeriodCount: 0, churnRisk: [], churnRiskTotal: 0 },
      });
    }
    if (url.includes("/api/invoices/stats/summary")) {
      return route.fulfill({
        json: {
          revenueThisMonth: 0,
          outstanding: 0,
          refundsThisMonth: 0,
          methodBreakdown: [],
        },
      });
    }
if (url.includes("/api/invoices")) {
      return route.fulfill({ json: { data: [], total: 0 } });
    }
    // Appointments, clients, services, staff, book, etc.
    return route.fulfill({ json: [] });
  });
});

test("customer portal loads at root", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation").getByText("GroomBook")).toBeVisible();
  await expect(page.locator("nav")).toBeVisible();
});

test("admin appointments page loads", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("GroomBook")).toBeVisible();
  // Calendar/appointments view renders
  await expect(page.locator("nav")).toBeVisible();
});

test("admin clients page loads", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByText("GroomBook")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clients" })).toBeVisible();
});

test("admin services page loads", async ({ page }) => {
  await page.goto("/admin/services");
  await expect(page.getByText("GroomBook")).toBeVisible();
  await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
});

test("admin staff page loads", async ({ page }) => {
  await page.goto("/admin/staff");
  await expect(page.getByText("GroomBook")).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff" })).toBeVisible();
});

test("admin invoices page loads", async ({ page }) => {
  await page.goto("/admin/invoices");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByText("GroomBook")).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
});

test("admin reports page loads", async ({ page }) => {
  await page.goto("/admin/reports");
  await expect(page.getByText("GroomBook")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
});

test("admin booking portal loads", async ({ page }) => {
  await page.goto("/admin/book");
  await expect(page.getByText("Book an Appointment")).toBeVisible();
  await expect(page.getByText("Choose a service")).toBeVisible();
});
