import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440001";
const APPOINTMENT_ID = "660e8400-e29b-41d4-a716-446655440002";
const SESSION_ID = "770e8400-e29b-41d4-a716-446655440003";

const futureDate = () => new Date(Date.now() + 30 * 60 * 1000);
const pastDate = () => new Date(Date.now() - 5 * 60 * 1000);

const ACTIVE_SESSION = {
  id: SESSION_ID,
  clientId: CLIENT_ID,
  status: "active" as const,
  expiresAt: futureDate(),
  createdAt: new Date(),
};

const EXPIRED_SESSION = {
  id: SESSION_ID,
  clientId: CLIENT_ID,
  status: "active" as const,
  expiresAt: pastDate(),
  createdAt: new Date(),
};

const APPOINTMENT = {
  id: APPOINTMENT_ID,
  clientId: CLIENT_ID,
  startTime: futureDate(),
  endTime: futureDate(),
  customerNotes: null,
  confirmationToken: "secret-token-leak-test",
};

let selectSessionRow: Record<string, unknown> | null = null;
let selectAppointmentRow: Record<string, unknown> | null = null;
let updatedValues: Record<string, unknown>[] = [];

function resetMock() {
  selectSessionRow = null;
  selectAppointmentRow = null;
  updatedValues = [];
}

vi.mock("@groombook/db", () => {
  function makeChainable(data: unknown[]): unknown {
    const arr = [...data];
    const chain = new Proxy(arr, {
      get(target, prop) {
        if (prop === "where" || prop === "orderBy" || prop === "limit") {
          return () => chain;
        }
        // @ts-expect-error proxy
        return target[prop];
      },
    });
    return chain;
  }

  const impersonationSessions = new Proxy(
    { _name: "impersonationSessions" },
    { get: (t, p) => (p === "_name" ? "impersonationSessions" : { table: "impersonationSessions", column: p }) }
  );

  const appointments = new Proxy(
    { _name: "appointments" },
    { get: (t, p) => (p === "_name" ? "appointments" : { table: "appointments", column: p }) }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: (table: { _name: string }) => {
          if (table._name === "impersonationSessions") {
            return makeChainable(selectSessionRow ? [selectSessionRow] : []);
          }
          if (table._name === "appointments") {
            return makeChainable(selectAppointmentRow ? [selectAppointmentRow] : []);
          }
          return makeChainable([]);
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => ({
            returning: () => {
              if (selectAppointmentRow) {
                const updated = { ...selectAppointmentRow, ...vals };
                updatedValues.push(vals);
                return [updated];
              }
              return [];
            },
          }),
        }),
      }),
    }),
    impersonationSessions,
    appointments,
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const { portalRouter } = await import("../routes/portal.js");

const app = new Hono();
app.route("/portal", portalRouter);

function jsonPatch(path: string, body: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => resetMock());

describe("PATCH /portal/appointments/:id/notes", () => {
  it("returns updated appointment with safe fields only", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT };
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Please be gentle with Fido" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(body).toHaveProperty("customerNotes", "Please be gentle with Fido");
    expect(body).toHaveProperty("updatedAt");
    expect(body).not.toHaveProperty("confirmationToken");
    expect(body).not.toHaveProperty("clientId");
  });

  it("returns 401 without X-Impersonation-Session-Id header", async () => {
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with expired session", async () => {
    selectSessionRow = EXPIRED_SESSION;
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 with ended session", async () => {
    selectSessionRow = null;
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when appointment belongs to different client", async () => {
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "different-client-id" };
    selectAppointmentRow = { ...APPOINTMENT };
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 422 for past appointment", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, startTime: pastDate() };
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/past|in-progress|cannot edit/i);
  });

  it("returns 422 when appointment is in progress", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, startTime: new Date(Date.now() - 2 * 60 * 1000) };
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when appointment not found", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = null;
    const res = await jsonPatch(
      `/portal/appointments/nonexistent-id/notes`,
      { customerNotes: "Test note" },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(404);
  });

  it("accepts notes at exactly 500 characters", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT };
    const longNote = "a".repeat(500);
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: longNote },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customerNotes).toBe(longNote);
  });

  it("rejects notes exceeding 500 characters", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT };
    const longNote = "a".repeat(501);
    const res = await jsonPatch(
      `/portal/appointments/${APPOINTMENT_ID}/notes`,
      { customerNotes: longNote },
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(400);
  });
});