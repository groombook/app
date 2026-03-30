import { test, expect } from "./fixtures.js";

/**
 * E2E test: Services Deduplication (GRO-306)
 *
 * Verifies there are no duplicate service names in:
 * 1. The admin services table (/admin/services)
 * 2. The booking wizard service picker (/admin/book)
 *
 * This test runs against current dev state (no GRO-300 dependency).
 */
test.describe("Admin Services Deduplication", () => {
  test("admin services table has no duplicate names", async ({
    staffPage,
  }) => {
    await staffPage.goto("/admin/services");
    await staffPage.waitForLoadState("networkidle");

    // Wait for the table to load
    await expect(staffPage.locator("table")).toBeVisible({ timeout: 10000 });

    // Collect all service name cells from the Name column (first column)
    const nameCells = staffPage.locator("table tbody tr td:first-child");
    const count = await nameCells.count();
    expect(count).toBeGreaterThan(0);

    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = (await nameCells.nth(i).textContent())?.trim() ?? "";
      names.push(text);
    }

    // Check for duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      if (name === "—") continue; // skip empty/placeholder
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
    }

    expect(duplicates).toHaveLength(0);
  });

  test("booking wizard service picker has no duplicate names", async ({
    staffPage,
  }) => {
    await staffPage.goto("/admin/book");
    await staffPage.waitForLoadState("networkidle");

    // Wait for services to load
    await expect(
      staffPage.getByText("Choose a service")
    ).toBeVisible({ timeout: 10000 });

    // Wait a bit for the services to render
    await staffPage.waitForTimeout(1000);

    // Collect all service names from the service cards
    // Each service card shows the name in a div with fontWeight 600
    const serviceNames = await staffPage
      .locator("text=/^[^-].*$/") // rough: get text nodes that aren't empty
      .all();

    // More precise: get service name elements from the service cards
    // The service cards have div > div:first-child with the name
    const cards = staffPage.locator('[role="button"]');
    const cardCount = await cards.count();
    expect(cardCount).toBeGreaterThan(0);

    const names: string[] = [];
    for (let i = 0; i < cardCount; i++) {
      const card = cards.nth(i);
      // The name is in the first child div with fontWeight 600
      const nameEl = card.locator("div").first();
      const text = (await nameEl.textContent())?.trim() ?? "";
      if (text) names.push(text);
    }

    // Check for duplicates
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
    }

    expect(duplicates).toHaveLength(0);
  });
});