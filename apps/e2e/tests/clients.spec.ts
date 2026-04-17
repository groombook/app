import { test, expect } from "./fixtures.js";

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
    emailOptOut: false,
    status: "active",
    disabledAt: null,
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
    emailOptOut: false,
    status: "active",
    disabledAt: null,
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
  await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
});

test("clicking a client shows their details", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByText("Alice Johnson")).toBeVisible();
  await page.getByText("Alice Johnson").click();
  // Email appears in both the list row and the detail panel once selected
  await expect(page.getByText("alice@example.com")).toHaveCount(2);
});

test("direct URL navigation to client detail fetches data and renders client name", async ({ page }) => {
  // Mock individual client fetch for direct navigation
  await page.route("/api/clients/client-1", (route) =>
    route.fulfill({ json: MOCK_CLIENTS[0] })
  );
  // Mock pets for this client
  await page.route("/api/pets**", (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto("/admin/clients/client-1");
  // Client name must be visible without any clicking
  await expect(page.getByText("Alice Johnson")).toBeVisible();
  // Should show back to list link
  await expect(page.getByText("← Back to list")).toBeVisible();
});

test("direct URL navigation shows loading then client", async ({ page }) => {
  let resolvePets: (value: unknown) => void;
  const petsPromise = new Promise((resolve) => { resolvePets = resolve; });

  await page.route("/api/clients/client-1", (route) =>
    route.fulfill({ json: MOCK_CLIENTS[0] })
  );
  await page.route("/api/pets**", async (route) => {
    await petsPromise;
    await route.fulfill({ json: [] });
  });

  const navigationPromise = page.goto("/admin/clients/client-1");
  // Should show loading state briefly
  await expect(page.getByText("Loading client…")).toBeVisible();
  // Resolve pets and wait for navigation
  resolvePets!();
  await navigationPromise;
  // After data loads, client name is shown
  await expect(page.getByText("Alice Johnson")).toBeVisible();
});

test("direct URL navigation shows error state on failure", async ({ page }) => {
  await page.route("/api/clients/nonexistent", (route) =>
    route.fulfill({ status: 404, json: { error: "Client not found" } })
  );

  await page.goto("/admin/clients/nonexistent");
  await expect(page.getByText(/client not found/i)).toBeVisible();
  await expect(page.getByText("← Back to clients")).toBeVisible();
});
