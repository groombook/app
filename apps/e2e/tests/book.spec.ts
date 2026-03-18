import { test, expect } from "@playwright/test";

/**
 * Booking portal happy-path E2E test.
 *
 * All API calls are mocked so this runs without a live backend.
 * The test walks through all 4 steps of the booking wizard and
 * verifies the confirmation screen is shown.
 */

const MOCK_SERVICE = {
  id: "svc-1",
  name: "Full Groom",
  description: "Bath, dry, haircut, nail trim",
  basePriceCents: 7500,
  durationMinutes: 90,
  isActive: true,
};

const MOCK_SLOT = "2026-03-20T09:00:00.000Z";

const MOCK_BOOKING_RESULT = {
  appointment: {
    id: "appt-1",
    startTime: MOCK_SLOT,
    endTime: "2026-03-20T10:30:00.000Z",
  },
  client: { id: "client-1", name: "Jane Smith", email: "jane@example.com" },
  pet: { id: "pet-1", name: "Buddy" },
};

test("complete booking flow", async ({ page }) => {
  // ── Mock API routes ──────────────────────────────────────────────────────

  await page.route("/api/book/services", (route) =>
    route.fulfill({ json: [MOCK_SERVICE] })
  );

  await page.route("/api/book/availability**", (route) =>
    route.fulfill({ json: [MOCK_SLOT] })
  );

  await page.route("/api/book/appointments", (route) =>
    route.fulfill({ status: 200, json: MOCK_BOOKING_RESULT })
  );

  // ── Step 1: Select a service ──────────────────────────────────────────────

  await page.goto("/book");
  await expect(page.getByText("Book an Appointment")).toBeVisible();
  await expect(page.getByText("Choose a service")).toBeVisible();

  // Wait for services to load and click the service card
  await expect(page.getByText("Full Groom")).toBeVisible();
  await page.getByText("Full Groom").click();

  // ── Step 2: Pick date and time ────────────────────────────────────────────

  await expect(page.getByText("Choose a date and time")).toBeVisible();

  // Wait for the slot to appear and select it
  await expect(page.getByRole("button", { name: /\d{1,2}:\d{2}/ })).toBeVisible();
  await page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first().click();

  await page.getByRole("button", { name: "Continue" }).click();

  // ── Step 3: Enter contact info ────────────────────────────────────────────

  await expect(page.getByText("Your information")).toBeVisible();

  await page.getByPlaceholder("Jane Smith").fill("Jane Smith");
  await page.getByPlaceholder("jane@example.com").fill("jane@example.com");
  await page.getByPlaceholder("Buddy").fill("Buddy");
  await page.locator("select").selectOption("dog");

  await page.getByRole("button", { name: "Review booking" }).click();

  // ── Step 4: Confirm booking ───────────────────────────────────────────────

  await expect(page.getByText("Confirm your booking")).toBeVisible();
  await expect(page.getByText("Full Groom")).toBeVisible();
  await expect(page.getByText("Jane Smith")).toBeVisible();
  await expect(page.getByText("Buddy")).toBeVisible();

  await page.getByRole("button", { name: "Confirm booking" }).click();

  // ── Step 5: Success screen ────────────────────────────────────────────────

  await expect(page.getByText("Booking confirmed!")).toBeVisible();
  await expect(page.getByText("jane@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: "Book another appointment" })).toBeVisible();
});

test("booking form validation — required fields", async ({ page }) => {
  await page.route("/api/book/services", (route) =>
    route.fulfill({ json: [MOCK_SERVICE] })
  );
  await page.route("/api/book/availability**", (route) =>
    route.fulfill({ json: [MOCK_SLOT] })
  );

  await page.goto("/book");
  await page.getByText("Full Groom").click();
  await page.getByRole("button", { name: /\d{1,2}:\d{2}/ }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();

  // Submit without filling required fields
  await page.getByRole("button", { name: "Review booking" }).click();

  await expect(page.getByText("Please fill in all required fields.")).toBeVisible();
});

test("no services available — shows message", async ({ page }) => {
  await page.route("/api/book/services", (route) =>
    route.fulfill({ json: [] })
  );

  await page.goto("/book");
  await expect(page.getByText("No services available")).toBeVisible();
});
