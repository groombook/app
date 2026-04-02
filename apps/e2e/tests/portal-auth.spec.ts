import { test, expect } from "./fixtures.js";

/**
 * E2E tests for client portal authentication via dev login selector.
 * Verifies the fix for the "Hi, Guest" bug where client name was not displayed.
 */

test.describe("Client Portal Auth", () => {
  test("portal shows client name after login via dev selector", async ({ page }) => {
    // Navigate to login
    await page.goto("/login");

    // Select Carol Client (has 2 pets per fixtures.ts)
    await page.getByText("Carol Client").click();

    // Should navigate to portal home
    await expect(page).toHaveURL("/");

    // Heading should contain client name, NOT "Hi, Guest" or "Please sign in"
    const greeting = page.locator("text=/Hi,\\s*Carol/");
    await expect(greeting).toBeVisible({ timeout: 10_000 });

    // Should NOT show "Hi, Guest"
    await expect(page.locator("text=/Hi,\\s*Guest/")).not.toBeVisible();

    // Portal dashboard should render with actual content
    await expect(page.locator("nav")).toBeVisible();
    // Dashboard section should be visible (Home nav item is active by default)
    await expect(page.getByRole("button", { name: /Home/i })).toBeVisible();
  });

  test("portal does not show Please sign in after client login", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("/");

    // Should not show "Please sign in" message
    await expect(page.locator("text=/Please sign in/i")).not.toBeVisible({ timeout: 5_000 });
  });

  test("different client gets correct name displayed", async ({ page }) => {
    await page.goto("/login");

    // Select Dave Client (has 1 pet per fixtures.ts)
    await page.getByText("Dave Client").click();

    await expect(page).toHaveURL("/");

    // Should show Dave's name, not Carol's
    const greeting = page.locator("text=/Hi,\\s*Dave/");
    await expect(greeting).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=/Hi,\\s*Carol/")).not.toBeVisible();
  });
});