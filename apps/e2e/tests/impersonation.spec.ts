import { test, expect } from "./fixtures.js";

/**
 * E2E tests for customer portal impersonation flow.
 * Tests ImpersonationBanner display, actions, and session management.
 */

const MOCK_SESSION = {
  id: "session-1",
  staffId: "staff-1",
  clientId: "client-1",
  reason: "Testing customer booking flow",
  status: "active",
  startedAt: new Date().toISOString(),
  endedAt: null,
  expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
};

test.describe("ImpersonationBanner", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/impersonation/sessions/session-1", (route) =>
      route.fulfill({ json: MOCK_SESSION })
    );
    await page.route("**/api/impersonation/sessions/session-1/end", (route) =>
      route.fulfill({ json: { status: "ended" } })
    );
    await page.route("**/api/impersonation/sessions/session-1/extend", (route) =>
      route.fulfill({ json: { ...MOCK_SESSION, expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() } })
    );
    await page.route("**/api/impersonation/sessions/session-1/audit-log", (route) =>
      route.fulfill({ json: { logs: [] } })
    );
    // Portal session endpoints needed when CustomerPortal fetches client profile after session is established
    await page.route("POST **/api/portal/dev-session", (route) =>
      route.fulfill({ json: { id: "session-1", client: { id: "client-1", name: "Carol Client" } } })
    );
    await page.route("GET **/api/portal/me", (route) =>
      route.fulfill({ json: { id: "client-1", name: "Carol Client", email: "carol@test.com" } })
    );
  });

  test("banner displays when session is active", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await expect(page.locator("[data-testid=\"impersonation-banner\"]")).toBeVisible();
    await expect(page.getByTestId("impersonation-banner").getByText("STAFF VIEW")).toBeVisible();
  });

  test("banner shows reason when session has reason", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await expect(page.getByText(/Reason: Testing customer booking flow/)).toBeVisible();
  });

  test("banner shows started time", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await expect(page.getByText(/Started/)).toBeVisible();
  });

  test("End Session button is visible", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await expect(page.getByRole("button", { name: /End Session/ })).toBeVisible();
  });

  test("Audit button is visible", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await expect(page.getByRole("button", { name: /Audit/ })).toBeVisible();
  });

  test("clicking End Session calls API and redirects", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await page.getByRole("button", { name: /End Session/ }).click();
    await expect(page.getByTestId("impersonation-banner")).not.toBeVisible();
  });

  test("Extend button appears when time is low and not extended", async ({ page }) => {
    const lowTimeSession = {
      ...MOCK_SESSION,
      expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
    };
    await page.route("**/api/impersonation/sessions/session-1", (route) =>
      route.fulfill({ json: lowTimeSession })
    );
    await page.goto("/?sessionId=session-1");
    await expect(page.getByRole("button", { name: /Extend/ })).toBeVisible();
  });

  test("URL is cleaned when session ends", async ({ page }) => {
    await page.goto("/?sessionId=session-1");
    await page.getByRole("button", { name: /End Session/ }).click();
    await expect(page).not.toHaveURL(/sessionId=session-1/);
  });
});
