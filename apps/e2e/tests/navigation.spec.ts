import { test, expect } from "@playwright/test";

/**
 * Navigation smoke tests — verifies that each page loads without errors.
 * These tests mock all API calls so they can run without a live backend.
 */

test.beforeEach(async ({ page }) => {
  // Intercept all API calls and return empty defaults so pages render.
  // Reports endpoints need shaped responses (not bare []) to avoid render crashes.
  await page.route("/api/**", (route) => {
    const url = route.request().url();
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
    // Appointments, clients, services, staff, invoices, book, etc.
    return route.fulfill({ json: [] });
  });
});

test("appointments page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Groom Book")).toBeVisible();
  // Calendar/appointments view renders
  await expect(page.locator("nav")).toBeVisible();
});

test("clients page loads", async ({ page }) => {
  await page.goto("/clients");
  await expect(page.getByText("Groom Book")).toBeVisible();
  await expect(page.getByRole("link", { name: "Clients" })).toBeVisible();
});

test("services page loads", async ({ page }) => {
  await page.goto("/services");
  await expect(page.getByText("Groom Book")).toBeVisible();
  await expect(page.getByRole("link", { name: "Services" })).toBeVisible();
});

test("staff page loads", async ({ page }) => {
  await page.goto("/staff");
  await expect(page.getByText("Groom Book")).toBeVisible();
  await expect(page.getByRole("link", { name: "Staff" })).toBeVisible();
});

test("invoices page loads", async ({ page }) => {
  await page.goto("/invoices");
  await expect(page.getByText("Groom Book")).toBeVisible();
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
});

test("reports page loads", async ({ page }) => {
  await page.goto("/reports");
  await expect(page.getByText("Groom Book")).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toBeVisible();
});

test("booking portal loads", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByText("Book an Appointment")).toBeVisible();
  await expect(page.getByText("Choose a service")).toBeVisible();
});
