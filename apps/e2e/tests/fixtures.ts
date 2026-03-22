import { test as base } from "@playwright/test";

/**
 * Custom test fixture that bypasses the dev login redirect for E2E tests.
 *
 * When AUTH_DISABLED=true, the app fetches /api/dev/config and redirects to
 * /login if no dev-user is in localStorage. This fixture:
 * 1. Mocks /api/dev/config to return authDisabled: false
 * 2. Seeds localStorage with a dev user as a fallback
 *
 * This ensures E2E tests render pages directly without the login redirect.
 */
const MOCK_DEV_USERS = {
  staff: [
    { id: "staff-1", name: "Alice Groomer", email: "alice@groombook.dev", role: "groomer" },
    { id: "staff-2", name: "Bob Manager", email: "bob@groombook.dev", role: "manager" },
  ],
  clients: [
    { id: "client-1", name: "Carol Client", email: "carol@example.com", petCount: 2 },
    { id: "client-2", name: "Dave Client", email: null, petCount: 1 },
  ],
};

export const test = base.extend({
  page: async ({ page }, use) => {
    // Mock the dev config endpoint so the app skips the auth-disabled redirect
    await page.route("**/api/dev/config", (route) =>
      route.fulfill({ json: { authDisabled: false } })
    );
    // Mock the dev users endpoint for login selector tests
    await page.route("**/api/dev/users", (route) =>
      route.fulfill({ json: MOCK_DEV_USERS })
    );
    // Mock the branding endpoint so BrandingProvider resolves immediately
    await page.route("**/api/branding", (route) =>
      route.fulfill({
        json: {
          businessName: "GroomBook",
          primaryColor: "#4f8a6f",
          accentColor: "#8b7355",
          logoBase64: null,
          logoMimeType: null,
        },
      })
    );
    // Seed localStorage as a fallback in case the mock is bypassed
    await page.addInitScript(() => {
      localStorage.setItem(
        "dev-user",
        JSON.stringify({ type: "staff", id: "dev-user", name: "Dev User" })
      );
    });
    await use(page);
  },
});

export { expect } from "@playwright/test";
