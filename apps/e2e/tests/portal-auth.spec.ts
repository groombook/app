import { test, expect } from "./fixtures.js";

/**
 * E2E tests for client portal authentication.
 *
 * Verifies that after selecting a client via the dev login selector,
 * the portal correctly displays the client's name (not "Hi, Guest")
 * and renders the dashboard with actual content.
 *
 * This is a regression test for the bug where the portal always
 * showed "Hi, Guest" regardless of which client was selected.
 */

const MOCK_PORTAL_RESPONSE = {
  appointments: [
    {
      id: "appt-1",
      date: "2026-04-15",
      time: "10:00 AM",
      petName: "Buddy",
      serviceName: "Full Groom",
      status: "confirmed",
      groomerName: "Alice Groomer",
    },
  ],
  pets: [
    {
      id: "pet-1",
      name: "Buddy",
      species: "dog",
      breed: "Golden Retriever",
      weight: 65,
      healthAlerts: [],
    },
  ],
  invoices: [
    {
      id: "inv-1",
      invoiceNumber: "INV-001",
      date: "2026-03-01",
      amount: 7500,
      status: "paid",
      items: [{ description: "Full Groom", price: 7500 }],
    },
  ],
};

test.describe("Client Portal Auth", () => {
  test.beforeEach(async ({ page }) => {
    // Mock portal API endpoints so dashboard renders
    await page.route("/api/portal/appointments", (route) =>
      route.fulfill({ json: { appointments: MOCK_PORTAL_RESPONSE.appointments } })
    );
    await page.route("/api/portal/pets", (route) =>
      route.fulfill({ json: { pets: MOCK_PORTAL_RESPONSE.pets } })
    );
    await page.route("/api/portal/invoices", (route) =>
      route.fulfill({ json: { invoices: MOCK_PORTAL_RESPONSE.invoices } })
    );
  });

  test("portal shows client name after login via dev selector", async ({ page }) => {
    // Navigate to login and select Carol Client
    await page.goto("/login");
    await expect(page.getByText("Dev Login Selector")).toBeVisible();

    // Click on Carol Client to log in
    await page.getByText("Carol Client").click();

    // Should navigate to portal home
    await expect(page).toHaveURL("http://localhost:8080/");

    // Dashboard should show client name, NOT "Hi, Guest" or "Please sign in"
    await expect(page.getByText("Welcome back, Carol Client")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Hi, Guest")).not.toBeVisible();
    await expect(page.getByText("Please sign in")).not.toBeVisible();
  });

  test("portal dashboard renders actual content after login", async ({ page }) => {
    // Login as Carol Client
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("http://localhost:8080/");

    // Dashboard should render pet cards with actual content
    await expect(page.getByText("Buddy")).toBeVisible({ timeout: 10_000 });

    // Should show appointment section (or empty state)
    // The key is that the dashboard loaded, not that it shows specific data
    await expect(page.getByText("Welcome back, Carol Client")).toBeVisible();
  });

  test("unauthenticated portal redirects to login", async ({ page }) => {
    // Clear any stored session
    await page.evaluate(() => localStorage.removeItem("dev-user"));

    // Navigate to portal home
    await page.goto("/");

    // Should redirect to login page
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Dev Login Selector")).toBeVisible();
  });
});
