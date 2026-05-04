import { test, expect } from "./fixtures.js";

/**
 * E2E tests for portal data integrity.
 * Verifies that portal sections render correctly without JS errors
 * and without showing "Please sign in" messages.
 */

const MOCK_PET = {
  id: "pet-1",
  name: "Buddy",
  species: "dog",
  breed: "Golden Retriever",
  clientId: "client-1",
};

const MOCK_SESSION = {
  id: "session-1",
  staffId: "staff-1",
  clientId: "client-1",
  reason: "E2E test",
  status: "active",
  startedAt: new Date().toISOString(),
  endedAt: null,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};

test.describe("Portal Data Integrity", () => {
  test.beforeEach(async ({ page }) => {
    // Login as Carol Client first
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("/");

    // Mock portal/me for client data
    await page.route("**/api/portal/me", (route) =>
      route.fulfill({ json: { id: "client-1", name: "Carol Client", email: "carol@example.com" } })
    );

    // Mock portal session endpoint
    await page.route("**/api/portal/dev-session", (route) =>
      route.fulfill({ json: MOCK_SESSION })
    );
  });

  test("appointments section renders without Please sign in", async ({ page }) => {
    // Navigate to appointments section
    await page.getByRole("button", { name: /Appointments/i }).click();

    // Should not show "Please sign in" message
    await expect(page.locator("text=/Please sign in/i")).not.toBeVisible({ timeout: 5_000 });

    // Content area should be present
    await expect(page.locator("main")).toBeVisible();
  });

  test("pets section renders with content or empty state", async ({ page }) => {
    // Mock pets endpoint
    await page.route("**/api/pets**", (route) =>
      route.fulfill({ json: [MOCK_PET] })
    );

    // Navigate to pets section
    await page.getByRole("button", { name: /My Pets/i }).click();

    // Should not show "Please sign in" message
    await expect(page.locator("text=/Please sign in/i")).not.toBeVisible({ timeout: 5_000 });

    // Content should render - either pet card or empty state
    await expect(page.locator("main")).toBeVisible();
  });

  test("billing section renders without JS errors", async ({ page }) => {
    // Mock portal billing endpoints
    await page.route("**/api/portal/config**", (route) =>
      route.fulfill({ json: { stripePublishableKey: "" } })
    );
    await page.route("**/api/portal/invoices**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.route("**/api/portal/payment-methods**", (route) =>
      route.fulfill({ json: [] })
    );

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Navigate to billing section
    await page.getByRole("button", { name: /Billing/i }).click();

    // Wait for content to load
    await page.waitForTimeout(1_000);

    // Should not show "Please sign in" message
    await expect(page.locator("text=/Please sign in/i")).not.toBeVisible({ timeout: 5_000 });

    // No JS errors should have occurred
    const jsErrors = consoleErrors.filter(e => !e.includes("favicon") && !e.includes("404"));
    expect(jsErrors).toHaveLength(0);
  });

  test("dashboard renders correctly after login", async ({ page }) => {
    // Should already be on dashboard (/) after login

    // Should not show "Please sign in"
    await expect(page.locator("text=/Please sign in/i")).not.toBeVisible({ timeout: 5_000 });

    // Should show the greeting with client name
    await expect(page.locator("text=/Hi,\\s*Carol/")).toBeVisible();

    // Navigation should be visible
    await expect(page.locator("nav")).toBeVisible();
  });
});