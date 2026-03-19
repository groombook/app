import { test, expect } from "@playwright/test";

/**
 * Client management E2E tests.
 *
 * API calls are mocked so tests run without a live backend.
 */

const MOCK_CLIENTS = [
  {
    id: "client-1",
    name: "Alice Johnson",
    email: "alice@example.com",
    phone: "555-0101",
    address: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "client-2",
    name: "Bob Williams",
    email: "bob@example.com",
    phone: null,
    address: null,
    notes: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("/api/clients**", (route) =>
    route.fulfill({ json: MOCK_CLIENTS })
  );
  // Pets loaded when a client is selected
  await page.route("/api/pets**", (route) =>
    route.fulfill({ json: [] })
  );
});

test("clients page shows client list", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByText("Alice Johnson")).toBeVisible();
  await expect(page.getByText("Bob Williams")).toBeVisible();
});

test("clients page shows search input", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByPlaceholder(/search/i)).toBeVisible();
});

test("clicking a client shows their details", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByText("Alice Johnson")).toBeVisible();
  await page.getByText("Alice Johnson").click();
  // Email appears in both the list row and the detail panel once selected
  await expect(page.getByText("alice@example.com")).toHaveCount(2);
});
