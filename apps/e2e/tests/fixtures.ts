import { test as base } from "@playwright/test";

/**
 * Custom test fixture that bypasses auth for E2E tests.
 *
 * When authDisabled=true, the app uses the dev login selector instead of
 * Better Auth signIn.social(). This fixture:
 * 1. Mocks /api/dev/config to return authDisabled: true
 * 2. Seeds localStorage with a dev user so the selector auto-selects a session
 *
 * This ensures E2E tests render pages directly without the auth redirect.
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
    // Mock the dev config endpoint so the app uses dev login selector (bypasses Better Auth)
    await page.route("**/api/dev/config", (route) =>
      route.fulfill({ json: { authDisabled: true } })
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
    // Mock the setup status endpoint so the app does not redirect to /setup
    await page.route("**/api/setup/status", (route) =>
      route.fulfill({ json: { needsSetup: false } })
    );
    // Mock the portal dev-session endpoint for client portal login
    await page.route("**/api/portal/dev-session", (route) =>
      route.fulfill({
        status: 201,
        json: {
          id: "dev-session-1",
          staffId: "00000000-0000-0000-0000-000000000001",
          clientId: route.request().postDataJSON().clientId,
          reason: "dev-mode-client-portal",
          status: "active",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
