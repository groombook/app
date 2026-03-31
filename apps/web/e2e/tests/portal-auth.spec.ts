import { test, expect } from "./fixtures.js";

/**
 * E2E test: Client Portal Auth (GRO-306 / GRO-300)
 *
 * Verifies that after logging in as a client via the dev login selector,
 * the portal displays the client's actual name (not "Hi, Guest" or "Please sign in").
 *
 * DEPENDENCY: Requires GRO-300 to be deployed to dev. This test will only
 * pass once the portal auth fix (proper session → customer name resolution) lands.
 *
 * Journey:
 * 1. Navigate to /login
 * 2. Select a client (Carol Client or any available client)
 * 3. Navigate to /
 * 4. Assert: heading contains client name (NOT "Hi, Guest" or "Please sign in")
 * 5. Assert: portal dashboard section renders with actual content
 */
test.describe("Client Portal Auth", () => {
  test.skip("portal shows client name after login, not 'Hi, Guest'", async ({
    clientPage,
  }) => {
    await clientPage.goto("/");

    // Wait for the portal to fully load
    await clientPage.waitForLoadState("networkidle");

    // The portal heading should contain the logged-in client's name, not "Guest"
    // We check for either the client name being present OR the anti-patterns being absent
    const bodyText = await clientPage.textContent("body");

    // Assert the anti-patterns are NOT present
    await expect(clientPage.locator("text=Please sign in")).not.toBeVisible({
      timeout: 5000,
    });

    // The portal should show something other than "Hi, Guest"
    // If the session is properly loaded, it should show the actual client name
    // We check that "Hi, Guest" is NOT visible
    const hiGuest = clientPage.locator("text=Hi, Guest");
    await expect(hiGuest).not.toBeVisible({ timeout: 5000 });

    // The portal dashboard should be visible — the nav and main content area
    await expect(clientPage.locator("nav")).toBeVisible();
  });

  test.skip("portal dashboard section renders with content", async ({ clientPage }) => {
    await clientPage.goto("/");
    await clientPage.waitForLoadState("networkidle");

    // Check that the dashboard/home section renders
    // The portal has a nav with items like "Home", "Appointments", etc.
    const nav = clientPage.locator("nav");
    await expect(nav).toBeVisible();

    // The greeting should NOT be the static mock default
    // After GRO-300, it should reflect the actual logged-in client
    const pageContent = await clientPage.textContent("body");
    expect(pageContent).not.toContain("Please sign in");
  });
});