import { test, expect } from "./fixtures.js";

/**
 * E2E tests for the DevLoginSelector page (/login).
 * Tests staff/client selection, skip login, and navigation redirects.
 */

test.describe("DevLoginSelector", () => {
  test("renders login page with staff and clients sections", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Dev Login Selector")).toBeVisible();
    await expect(page.getByText("Staff")).toBeVisible();
    await expect(page.getByText("Clients")).toBeVisible();
  });

  test("shows loading state while fetching users", async ({ page }) => {
    await page.unroute("**/api/dev/users");
    await page.route("**/api/dev/users", async (route) => {
      await new Promise((r) => setTimeout(r, 200));
      await route.fulfill({ json: { staff: [], clients: [] } });
    });
    await page.goto("/login");
    await expect(page.getByText("Loading users...")).toBeVisible();
  });

  test("displays staff users with role and email", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Alice Groomer")).toBeVisible();
    await expect(page.getByText("groomer · alice@groombook.dev")).toBeVisible();
    await expect(page.getByText("Bob Manager")).toBeVisible();
    await expect(page.getByText("manager · bob@groombook.dev")).toBeVisible();
  });

  test("displays client users with pet count", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Carol Client")).toBeVisible();
    await expect(page.getByText("2 pets · carol@example.com")).toBeVisible();
    await expect(page.getByText("Dave Client")).toBeVisible();
    await expect(page.getByText("1 pet")).toBeVisible();
  });

  test("clicking staff user navigates to /admin and stores dev-user", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("/admin");
    const devUser = await page.evaluate(() => localStorage.getItem("dev-user"));
    expect(JSON.parse(devUser!)).toMatchObject({ type: "staff", id: "staff-1", name: "Alice Groomer" });
  });

  test("clicking client user navigates to / and stores dev-user", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Carol Client").click();
    await expect(page).toHaveURL("/");
    const devUser = await page.evaluate(() => localStorage.getItem("dev-user"));
    expect(JSON.parse(devUser!)).toMatchObject({ type: "client", id: "client-1", name: "Carol Client" });
  });

  test("skip login removes dev-user and navigates to /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Continue as default dev user").click();
    await expect(page).toHaveURL("/admin");
    const devUser = await page.evaluate(() => localStorage.getItem("dev-user"));
    expect(devUser).toBeNull();
  });

  test("no users available shows empty sections", async ({ page }) => {
    await page.route("**/api/dev/users", (route) =>
      route.fulfill({ json: { staff: [], clients: [] } })
    );
    await page.goto("/login");
    await expect(page.getByText("Staff")).toBeVisible();
    await expect(page.getByText("Clients")).toBeVisible();
  });
});
