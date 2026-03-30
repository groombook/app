import { test, expect } from "./fixtures.js";

/**
 * E2E tests for admin services page.
 *
 * Verifies that:
 * 1. Service names are unique (no duplicate rows in the table)
 * 2. Service picker in booking flow has no duplicates
 */

const MOCK_SERVICES = [
  { id: "svc-1", name: "Full Groom", description: "Bath, dry, haircut", basePriceCents: 7500, durationMinutes: 90, isActive: true },
  { id: "svc-2", name: "Bath & Brush", description: "Bath and brushing", basePriceCents: 3500, durationMinutes: 45, isActive: true },
  { id: "svc-3", name: "Nail Trim", description: "Nail trimming", basePriceCents: 1500, durationMinutes: 15, isActive: true },
  { id: "svc-4", name: "Full Groom", description: "Another duplicate", basePriceCents: 7000, durationMinutes: 85, isActive: true },
];

test.describe("Admin Services", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/services", (route) =>
      route.fulfill({ json: MOCK_SERVICES })
    );
  });

  test("services page has no duplicate service names", async ({ page }) => {
    await page.goto("/login");
    // Log in as staff (Alice Groomer)
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    // Navigate to services page
    await page.goto("/admin/services");

    // Wait for services to load
    await page.waitForSelector("table", { timeout: 10_000 });

    // Collect all service names from the table
    const serviceNames = await page.locator("table tbody tr").evaluateAll((rows) =>
      rows.map((row) => {
        const cells = row.querySelectorAll("td");
        // Name is typically the second column (index 1)
        return cells.length > 1 ? cells[1].textContent?.trim() || "" : "";
      })
    );

    // Check for duplicates
    const duplicates = serviceNames.filter((name, index) => name !== "" && serviceNames.indexOf(name) !== index);

    expect(duplicates).toHaveLength(0);
  });

  test("service picker in booking flow has no duplicates", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    // Navigate to booking
    await page.goto("/admin/book");

    // Wait for services to load in the picker
    await page.waitForSelector("text=Choose a service", { timeout: 10_000 });

    // Get all service names visible in the picker
    const serviceCards = await page.locator("text=Full Groom").count();

    // The mock has "Full Groom" appearing twice - this should be caught
    // If the duplicate exists, count will be > 1 for that text
    // But in a real picker UI, duplicates might show as separate cards
    // So we check the actual text content of service options
    const allServiceTexts: string[] = [];
    await page.locator('[role="button"], .card, .service-card, button').all().then(async (els) => {
      for (const el of els) {
        const text = await el.textContent();
        if (text) allServiceTexts.push(...text.split("\n").map((t) => t.trim()).filter(Boolean));
      }
    });

    // Find duplicates
    const serviceNameOccurrences = allServiceTexts.filter((t) =>
      ["Full Groom", "Bath & Brush", "Nail Trim"].includes(t)
    );
    const duplicateNames = serviceNameOccurrences.filter(
      (name, index) => serviceNameOccurrences.indexOf(name) !== index
    );

    expect(duplicateNames).toHaveLength(0);
  });

  test("all services are active and displayed", async ({ page }) => {
    await page.goto("/login");
    await page.getByText("Alice Groomer").click();
    await expect(page).toHaveURL("http://localhost:8080/admin");

    await page.goto("/admin/services");
    await page.waitForSelector("table", { timeout: 10_000 });

    // Should see all non-duplicate services
    await expect(page.getByText("Full Groom")).toBeVisible();
    await expect(page.getByText("Bath & Brush")).toBeVisible();
    await expect(page.getByText("Nail Trim")).toBeVisible();
  });
});
