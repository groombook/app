import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─── Mock appointment data ────────────────────────────────────────────────────

const FUTURE_TIME = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 1 week from now
const PAST_TIME = new Date(Date.now() - 24 * 60 * 60 * 1000);        // 1 day ago

const BASE_APPT = {
  id: "appt-uuid-1",
  clientId: "client-uuid-1",
  petId: "pet-uuid-1",
  serviceId: "service-uuid-1",
  staffId: "staff-uuid-1",
  batherStaffId: null,
  status: "scheduled" as const,
  startTime: FUTURE_TIME,
  endTime: new Date(FUTURE_TIME.getTime() + 3600_000),
  notes: null,
  priceCents: null,
  seriesId: null,
  seriesIndex: null,
  groupId: null,
  confirmationStatus: "pending",
  confirmedAt: null,
  cancelledAt: null,
  confirmationToken: "valid-token-abc123",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Shared mock DB state ─────────────────────────────────────────────────────

let mockAppt: typeof BASE_APPT | null = BASE_APPT;
let lastUpdate: Record<string, unknown> = {};

function resetMock() {
  mockAppt = { ...BASE_APPT };
  lastUpdate = {};
}

vi.mock("@groombook/db", () => {
  const appointments = new Proxy(
    { _name: "appointments" },
    { get: (t, p) => (p === "_name" ? "appointments" : { table: "appointments", column: p }) }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => (mockAppt ? [mockAppt] : []),
          }),
        }),
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => {
            lastUpdate = { ...vals };
            if (mockAppt) {
              mockAppt = { ...mockAppt, ...vals } as typeof BASE_APPT;
            }
            return { returning: () => (mockAppt ? [mockAppt] : []) };
          },
        }),
      }),
    }),
    appointments,
    eq: () => ({}),
  };
});

// ─── Book router (tokenized endpoints) ───────────────────────────────────────

async function makeBookApp() {
  const { bookRouter } = await import("../routes/book.js");
  const app = new Hono();
  app.route("/api/book", bookRouter);
  return app;
}

// ─── Appointments router (portal endpoints) ────────────────────────────────

async function makeAppointmentsApp() {
  const { appointmentsRouter } = await import("../routes/appointments.js");
  const app = new Hono();
  app.route("/api/appointments", appointmentsRouter);
  return app;
}

// ─── Tests: tokenized confirm endpoint ────────────────────────────────────────

describe("GET /api/book/confirm/:token", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    resetMock();
    app = await makeBookApp();
  });

  it("redirects to /booking/confirmed on valid token and future appointment", async () => {
    const res = await app.request("/api/book/confirm/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/confirmed");
  });

  it("sets confirmationStatus to confirmed", async () => {
    await app.request("/api/book/confirm/valid-token-abc123");
    expect(lastUpdate.confirmationStatus).toBe("confirmed");
    expect(lastUpdate.confirmedAt).toBeInstanceOf(Date);
  });

  it("redirects to /booking/error when token not found", async () => {
    mockAppt = null;
    const res = await app.request("/api/book/confirm/bad-token");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });

  it("redirects to /booking/error when appointment is in the past", async () => {
    mockAppt = { ...BASE_APPT, startTime: PAST_TIME };
    const res = await app.request("/api/book/confirm/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });

  it("redirects to /booking/confirmed idempotently when already confirmed", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "confirmed" };
    const res = await app.request("/api/book/confirm/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/confirmed");
  });

  it("redirects to /booking/error when appointment is already customer-cancelled", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "cancelled" };
    const res = await app.request("/api/book/confirm/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });
});

// ─── Tests: tokenized cancel endpoint ────────────────────────────────────────

describe("GET /api/book/cancel/:token", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    resetMock();
    app = await makeBookApp();
  });

  it("redirects to /booking/cancelled on valid token and future appointment", async () => {
    const res = await app.request("/api/book/cancel/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/cancelled");
  });

  it("sets confirmationStatus to cancelled and nullifies token (single-use)", async () => {
    await app.request("/api/book/cancel/valid-token-abc123");
    expect(lastUpdate.confirmationStatus).toBe("cancelled");
    expect(lastUpdate.cancelledAt).toBeInstanceOf(Date);
    expect(lastUpdate.confirmationToken).toBeNull();
  });

  it("redirects to /booking/error when token not found", async () => {
    mockAppt = null;
    const res = await app.request("/api/book/cancel/bad-token");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });

  it("redirects to /booking/error when appointment is in the past", async () => {
    mockAppt = { ...BASE_APPT, startTime: PAST_TIME };
    const res = await app.request("/api/book/cancel/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });

  it("redirects to /booking/error when already customer-cancelled", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "cancelled" };
    const res = await app.request("/api/book/cancel/valid-token-abc123");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/booking/error");
  });
});

// ─── Tests: portal confirm endpoint ──────────────────────────────────────────

describe("POST /api/appointments/:id/confirm", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    resetMock();
    app = await makeAppointmentsApp();
  });

  it("confirms a pending appointment", async () => {
    const res = await app.request("/api/appointments/appt-uuid-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(lastUpdate.confirmationStatus).toBe("confirmed");
    expect(lastUpdate.confirmedAt).toBeInstanceOf(Date);
  });

  it("returns 404 when appointment not found", async () => {
    mockAppt = null;
    const res = await app.request("/api/appointments/nonexistent/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when appointment is already customer-cancelled", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "cancelled" };
    const res = await app.request("/api/appointments/appt-uuid-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("returns 200 idempotently when appointment is already confirmed", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "confirmed" };
    const res = await app.request("/api/appointments/appt-uuid-1/confirm", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });
});

// ─── Tests: portal cancel endpoint ───────────────────────────────────────────

describe("POST /api/appointments/:id/cancel", () => {
  let app: Hono;

  beforeEach(async () => {
    vi.resetModules();
    resetMock();
    app = await makeAppointmentsApp();
  });

  it("cancels a pending appointment and nullifies the token", async () => {
    const res = await app.request("/api/appointments/appt-uuid-1/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(lastUpdate.confirmationStatus).toBe("cancelled");
    expect(lastUpdate.cancelledAt).toBeInstanceOf(Date);
    expect(lastUpdate.confirmationToken).toBeNull();
  });

  it("returns 404 when appointment not found", async () => {
    mockAppt = null;
    const res = await app.request("/api/appointments/nonexistent/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when appointment is already customer-cancelled", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "cancelled" };
    const res = await app.request("/api/appointments/appt-uuid-1/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(409);
  });

  it("can cancel a confirmed appointment", async () => {
    mockAppt = { ...BASE_APPT, confirmationStatus: "confirmed" };
    const res = await app.request("/api/appointments/appt-uuid-1/cancel", {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(lastUpdate.confirmationStatus).toBe("cancelled");
  });
});

// ─── Tests: token generation helper ──────────────────────────────────────────

describe("generateConfirmationToken", () => {
  it("generates a 64-character hex string", async () => {
    const { generateConfirmationToken } = await import("../routes/appointments.js");
    const token = generateConfirmationToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens on each call", async () => {
    const { generateConfirmationToken } = await import("../routes/appointments.js");
    const t1 = generateConfirmationToken();
    const t2 = generateConfirmationToken();
    expect(t1).not.toBe(t2);
  });
});

// ─── Tests: reminder email with action links ──────────────────────────────────

describe("buildReminderEmail with confirmation token", () => {
  it("includes confirm and cancel links when token is provided", async () => {
    const { buildReminderEmail } = await import("../services/email.js");
    const mail = buildReminderEmail(
      "client@example.com",
      {
        clientName: "Jane",
        petName: "Biscuit",
        serviceName: "Full Groom",
        groomerName: null,
        startTime: new Date(),
      },
      24,
      "abc123token"
    );
    expect(mail.text).toContain("abc123token");
    expect(mail.html as string).toContain("abc123token");
    expect(mail.html as string).toContain("Confirm Appointment");
    expect(mail.html as string).toContain("Cancel Appointment");
  });

  it("omits action links when no token is provided", async () => {
    const { buildReminderEmail } = await import("../services/email.js");
    const mail = buildReminderEmail(
      "client@example.com",
      {
        clientName: "Jane",
        petName: "Biscuit",
        serviceName: "Full Groom",
        groomerName: null,
        startTime: new Date(),
      },
      24,
      null
    );
    expect(mail.html as string).not.toContain("Confirm Appointment");
    expect(mail.html as string).not.toContain("Cancel Appointment");
  });
});
