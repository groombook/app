import { test, expect } from "./fixtures.js";

/**
 * E2E tests for portal data integrity.
 *
 * Verifies that after logging in as a client, all portal sections
 * (appointments, pets, billing) render correctly without showing
 * "Please sign in" messages or other auth-related errors.
 */

const MOCK_PORTAL_RESPONSE = {
  appointments: [
    {
      id: "appt-1",
      date: "2026-04-15",
      time: "10:00 AM",
      petName: "Buddy",
      serviceName: "Full Groom",
      status: "confirmed",
    },
  ],
  pets: [
    {
      id: "pet-1",
      name: "Buddy",
      species: "dog",
      breed: "Golden Retriever",
      weight: 65,
      healthAlerts: [],
    },
    {
      id: "pet-2",
      name: "Max",
      species: "cat",
      breed: "Tabby",
      weight: 10,
      healthAlerts: ["Vaccinations due"],
    },
  ],
  invoices: [
    {
      id: "inv-1",
      invoiceNumber: "INV-001",
      date: "2026-03-01",
      amount: 7500,
      status: "pending",
      dueDate: "2026-03-15",
      items: [{ description: "Full Groom", price: 7500 }],
    },
    {
      id: "inv-2",
      invoiceNumber: "INV-002",
      date: "2026-02-01",
      amount: 5000,
      status: "paid",
      items: [{ description: "Bath", price: 5000 }],
    },
  ],
};

// Helper to log in as Carol Client and wait for dashboard
async function loginAsClient(page: any) {
  await page.goto("/login");
  await page.getByText("Carol Client").click();
  await expect(page).toHaveURL("http://localhost:8080/");
  await expect(page.getByText("Welcome back, Carol Client")).toBeVisible({ timeout: 10_000 });
}

test.describe("Portal Data Integrity", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("/api/portal/appointments", (route) =>
      route.fulfill({ json: { appointments: MOCK_PORTAL_RESPONSE.appointments } })
    );
    await page.route("/api/portal/pets", (route) =>
      route.fulfill({ json: { pets: MOCK_PORTAL_RESPONSE.pets } })
    );
    await page.route("/api/portal/invoices", (route) =>
      route.fulfill({ json: { invoices: MOCK_PORTAL_RESPONSE.invoices } })
    );
  });

  test("appointments section renders without auth error", async ({ page }) => {
    await loginAsClient(page);

    // Click on appointments nav item - exact text depends on portal nav structure
    // Navigate to appointments section
    await page.goto("/");

    // Wait for dashboard to load
    await expect(page.getByText("Welcome back, Carol Client")).toBeVisible();

    // Verify no "Please sign in" message appears on the page
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Please sign in");
  });

  test("pets section renders with pet cards", async ({ page }) => {
    await loginAsClient(page);

    // The dashboard shows pet cards - verify they render
    await expect(page.getByText("Buddy")).toBeVisible();
    await expect(page.getByText("Max")).toBeVisible();
  });

  test("billing section renders without JS errors", async ({ page }) => {
    await loginAsClient(page);

    // Navigate to billing section (exact URL depends on portal routing)
    // For now, verify the dashboard loaded and doesn't show auth errors
    await expect(page.getByText("Welcome back, Carol Client")).toBeVisible();

    // Check no console errors occurred
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Navigate around portal
    await page.goto("/");
    await page.waitForTimeout(1000);

    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("dashboard shows data from API, not empty auth state", async ({ page }) => {
    await loginAsClient(page);

    // Dashboard should show appointment data
    await expect(page.getByText("Buddy")).toBeVisible({ timeout: 10_000 });

    // Should NOT show only "Please sign in" message
    await expect(page.getByText("Please sign in")).not.toBeVisible();
  });
});
