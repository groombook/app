import { test, expect } from "./fixtures.js";

/**
 * E2E tests for services deduplication.
 * Verifies that service names are unique in both admin services list
 * and in the booking service picker.
 */

const MOCK_SERVICES = [
  { id: "svc-1", name: "Full Groom", description: "Bath and haircut", basePriceCents: 7500, durationMinutes: 90, isActive: true },
  { id: "svc-2", name: "Bath Only", description: "Just the bath", basePriceCents: 3500, durationMinutes: 45, isActive: true },
  { id: "svc-3", name: "Nail Trim", description: "Just nails", basePriceCents: 1500, durationMinutes: 15, isActive: true },
];

test.describe("Services Deduplication", () => {
  test.beforeEach(async ({ page }) => {
    // Login as staff
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("/admin");

    // Mock services endpoint
    await page.route("**/api/services**", (route) =>
      route.fulfill({ json: MOCK_SERVICES })
    );
  });

  test("admin services page shows no duplicate service names", async ({ page }) => {
    await page.goto("/admin/services");

    // Wait for services to load
    await page.waitForTimeout(1_000);

    // Collect all service names from the table
    const serviceNameCells = page.locator("table tbody tr td:first-child");
    const count = await serviceNameCells.count();

    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await serviceNameCells.nth(i).textContent();
      if (text) names.push(text.trim());
    }

    // Check for duplicates
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

    // Assert no duplicate names
    expect(duplicates, `Found duplicate service names: ${duplicates.join(", ")}`).toHaveLength(0);

    // Verify all names are unique using Set comparison
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  test("admin services page renders all services", async ({ page }) => {
    await page.goto("/admin/services");

    // Wait for table to render
    await expect(page.locator("table")).toBeVisible({ timeout: 10_000 });

    // Should show the heading
    await expect(page.locator("h1")).toContainText("Services");

    // Should show all unique services
    const rowCount = await page.locator("table tbody tr").count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test("booking service picker shows no duplicates", async ({ page }) => {
    await page.goto("/admin/book");

    // Wait for services to load in the booking wizard
    await page.waitForTimeout(1_000);

    // Collect service names from the picker
    const serviceCards = page.locator("text=/Full Groom|Bath Only|Nail Trim/");
    const serviceNames: string[] = [];

    // Get all text content that looks like service names
    const allText = await page.locator("body").textContent();
    if (allText) {
      const matches = allText.match(/(?:Full Groom|Bath Only|Nail Trim)/g);
      if (matches) {
        serviceNames.push(...matches);
      }
    }

    // Check for duplicates in the booking picker
    const duplicates = serviceNames.filter((name, index) => serviceNames.indexOf(name) !== index);

    expect(duplicates, `Found duplicate service names in booking picker: ${duplicates.join(", ")}`).toHaveLength(0);
  });

  test("booking wizard step 1 shows services", async ({ page }) => {
    await page.goto("/admin/book");

    // Should show service selection step
    await expect(page.getByText("Choose a service")).toBeVisible({ timeout: 10_000 });

    // Should show at least one service
    await expect(page.getByText("Full Groom")).toBeVisible();
  });
});