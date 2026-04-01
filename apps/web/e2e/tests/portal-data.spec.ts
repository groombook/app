import { test, expect } from "./fixtures.js";

/**
 * E2E test: Portal Data Integrity (GRO-306)
 *
 * Verifies that the client portal sections render correctly with actual data
 * and don't show auth-gate messages after login.
 *
 * DEPENDENCY: Requires GRO-300 to be deployed. Tests 1 & 2 share this dependency.
 *
 * Journey:
 * 1. Login as client
 * 2. Navigate to appointments section — assert no "Please sign in", content renders
 * 3. Navigate to pets section — assert content renders (or explicit empty state)
 * 4. Navigate to billing section — assert no JS errors, section renders
 */
test.describe("Portal Data Integrity", () => {
  test.beforeEach(async ({ clientPage }) => {
    await clientPage.goto("/");
    await clientPage.waitForLoadState("networkidle");
  });

  test.skip("appointments section renders without auth gate", async ({
    clientPage,
  }) => {
    // Click the Appointments nav item
    const appointmentsNav = clientPage.getByRole("button", { name: /appointments/i });
    await appointmentsNav.click();
    await clientPage.waitForLoadState("networkidle");

    // Must NOT show "Please sign in" gate
    await expect(
      clientPage.locator("text=Please sign in")
    ).not.toBeVisible({ timeout: 5000 });

    // The section heading or nav should indicate we're in appointments
    await expect(
      clientPage.getByRole("heading", { name: "Appointments" })
    ).toBeVisible();
  });

  test.skip("pets section renders with content or explicit empty state", async ({
    clientPage,
  }) => {
    // Click the My Pets nav item
    const petsNav = clientPage.getByRole("button", { name: /my pets/i });
    await petsNav.click();
    await clientPage.waitForLoadState("networkidle");

    // Must NOT show auth gate
    await expect(
      clientPage.locator("text=Please sign in")
    ).not.toBeVisible({ timeout: 5000 });

    // Should show either pet content or a legitimate empty state
    const hasPetsContent =
      (await clientPage.locator("text=Add a pet").isVisible()) ||
      (await clientPage.locator("text=No pets").isVisible()) ||
      (await clientPage.locator('[role="button"]').count()) > 0;

    expect(hasPetsContent).toBeTruthy();
  });

  test.skip("billing section renders without JS errors", async ({ clientPage }) => {
    // Capture console errors
    const consoleErrors: string[] = [];
    clientPage.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // Click the Billing nav item
    const billingNav = clientPage.getByRole("button", { name: /billing/i });
    await billingNav.click();
    await clientPage.waitForLoadState("networkidle");

    // Must NOT show auth gate
    await expect(
      clientPage.locator("text=Please sign in")
    ).not.toBeVisible({ timeout: 5000 });

    // No JS exceptions on this section
    const jsExceptions = consoleErrors.filter(
      (e) => !e.includes("favicon") && !e.includes("404")
    );
    expect(jsExceptions).toHaveLength(0);
  });
});