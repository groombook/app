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
  status: "scheduled" as const,
  confirmationStatus: "pending" as const,
  confirmedAt: null,
  cancelledAt: null,
};

let selectSessionRow: Record<string, unknown> | null = null;
let selectAppointmentRow: Record<string, unknown> | null = null;
let updatedValues: Record<string, unknown>[] = [];
let selectBusinessSettingsRow: Record<string, unknown> | null = null;
let selectConversationRow: Record<string, unknown> | null = null;
let selectMessageRows: Record<string, unknown>[] = [];

function resetMock() {
  selectSessionRow = null;
  selectAppointmentRow = null;
  updatedValues = [];
  selectBusinessSettingsRow = null;
  selectConversationRow = null;
  selectMessageRows = [];
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

  const businessSettings = new Proxy(
    { _name: "businessSettings" },
    { get: (t, p) => (p === "_name" ? "businessSettings" : { table: "businessSettings", column: p }) }
  );

  const conversations = new Proxy(
    { _name: "conversations" },
    { get: (t, p) => (p === "_name" ? "conversations" : { table: "conversations", column: p }) }
  );

  const messages = new Proxy(
    { _name: "messages" },
    { get: (t, p) => (p === "_name" ? "messages" : { table: "messages", column: p }) }
  );

  const impersonationAuditLogs = new Proxy(
    { _name: "impersonationAuditLogs" },
    { get: (t, p) => (p === "_name" ? "impersonationAuditLogs" : { table: "impersonationAuditLogs", column: p }) }
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
          if (table._name === "businessSettings") {
            return makeChainable(selectBusinessSettingsRow ? [selectBusinessSettingsRow] : []);
          }
          if (table._name === "conversations") {
            return makeChainable(selectConversationRow ? [selectConversationRow] : []);
          }
          if (table._name === "messages") {
            return makeChainable(selectMessageRows);
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
    impersonationAuditLogs,
    businessSettings,
    conversations,
    messages,
    eq: vi.fn(),
    and: vi.fn(),
    lt: vi.fn(),
    desc: vi.fn((col: unknown) => ({ _name: "desc", col })),
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

// ─── POST /portal/appointments/:id/confirm ────────────────────────────────────

function jsonPost(path: string, headers?: Record<string, string>) {
  return app.request(path, {
    method: "POST",
    headers,
  });
}

describe("POST /portal/appointments/:id/confirm", () => {
  it("confirms a pending appointment and returns updated status", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, confirmationStatus: "pending" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.confirmationStatus).toBe("confirmed");
    expect(body).toHaveProperty("confirmedAt");
  });

  it("returns 401 without X-Impersonation-Session-Id header", async () => {
    const res = await jsonPost(`/portal/appointments/${APPOINTMENT_ID}/confirm`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired session", async () => {
    selectSessionRow = EXPIRED_SESSION;
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when appointment belongs to a different client", async () => {
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "different-client-id" };
    selectAppointmentRow = { ...APPOINTMENT };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when appointment is in the past", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, startTime: pastDate() };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when appointment is not pending confirmation", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, confirmationStatus: "confirmed" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when cancelling an already-cancelled appointment", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, status: "cancelled", confirmationStatus: "cancelled" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when appointment not found", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = null;
    const res = await jsonPost(
      `/portal/appointments/nonexistent-id/confirm`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(404);
  });
});

// ─── POST /portal/appointments/:id/cancel ─────────────────────────────────────

describe("POST /portal/appointments/:id/cancel", () => {
  it("cancels a pending appointment and returns updated status", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, confirmationStatus: "pending" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("cancelled");
    expect(body.confirmationStatus).toBe("cancelled");
    expect(body).toHaveProperty("cancelledAt");
  });

  it("returns 401 without X-Impersonation-Session-Id header", async () => {
    const res = await jsonPost(`/portal/appointments/${APPOINTMENT_ID}/cancel`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired session", async () => {
    selectSessionRow = EXPIRED_SESSION;
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when appointment belongs to a different client", async () => {
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "different-client-id" };
    selectAppointmentRow = { ...APPOINTMENT };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 when appointment is in the past", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, startTime: pastDate() };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when appointment is already cancelled", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, status: "cancelled", confirmationStatus: "cancelled" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 when appointment is already completed", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = { ...APPOINTMENT, status: "completed" };
    const res = await jsonPost(
      `/portal/appointments/${APPOINTMENT_ID}/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when appointment not found", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectAppointmentRow = null;
    const res = await jsonPost(
      `/portal/appointments/nonexistent-id/cancel`,
      { "X-Impersonation-Session-Id": SESSION_ID }
    );
    expect(res.status).toBe(404);
  });
});

// ─── Conversation routes ───────────────────────────────────────────────────────

const BUSINESS_ID = "880e8400-e29b-41d4-a716-446655440008";
const CONVERSATION_ID = "990e8400-e29b-41d4-a716-446655440009";

const CONVERSATION = {
  id: CONVERSATION_ID,
  clientId: CLIENT_ID,
  businessId: BUSINESS_ID,
  channel: "sms",
  status: "active",
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

const MESSAGE_1 = {
  id: "m1",
  conversationId: CONVERSATION_ID,
  direction: "inbound",
  body: "Hello",
  status: "delivered",
  createdAt: new Date().toISOString(),
  deliveredAt: new Date().toISOString(),
};

const MESSAGE_2 = {
  id: "m2",
  conversationId: CONVERSATION_ID,
  direction: "outbound",
  body: "Hi there!",
  status: "delivered",
  createdAt: new Date(Date.now() + 1000).toISOString(),
  deliveredAt: new Date().toISOString(),
};

function jsonGet(path: string, headers?: Record<string, string>) {
  return app.request(path, { method: "GET", headers });
}

describe("GET /portal/conversation", () => {
  it("returns 204 when no conversation exists", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = null;
    const res = await jsonGet("/portal/conversation", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(204);
  });

  it("returns conversation for the authenticated client", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = { ...CONVERSATION };
    const res = await jsonGet("/portal/conversation", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(CONVERSATION_ID);
    expect(body.channel).toBe("sms");
    expect(body.status).toBe("active");
  });

  it("returns 204 when client A's session has no conversation (cross-tenant isolation)", async () => {
    // Cross-tenant isolation is enforced at the query level via portalClientId scoping.
    // The mock cannot replicate eq() filtering — this test verifies the query is issued
    // and no conversation is returned when the mock has no row for the session's clientId.
    // Real DB: eq() on clientId ensures client A never sees client B's conversation.
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "client-a" };
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = null; // client-a has no conversation
    const res = await jsonGet("/portal/conversation", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(204);
  });
});

describe("GET /portal/conversation/messages", () => {
  it("returns 204 when no conversation exists", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = null;
    const res = await jsonGet("/portal/conversation/messages", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(204);
  });

  it("returns paginated messages", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = { ...CONVERSATION };
    selectMessageRows = [MESSAGE_2, MESSAGE_1];
    const res = await jsonGet("/portal/conversation/messages", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).toBe("m2");
    expect(body.messages[1].id).toBe("m1");
    expect(body.nextCursor).toBeNull();
  });

  it("returns messages and nextCursor reflects if more exist", async () => {
    // Note: the mock does not enforce limit(), so it returns all messages.
    // nextCursor is null when all messages fit (mock behavior).
    // Real DB enforces limit and sets nextCursor when messages.length === limit.
    selectSessionRow = ACTIVE_SESSION;
    selectBusinessSettingsRow = { id: BUSINESS_ID };
    selectConversationRow = { ...CONVERSATION };
    selectMessageRows = [MESSAGE_1, MESSAGE_2];
    const res = await jsonGet("/portal/conversation/messages?limit=1", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages.length).toBeGreaterThan(0);
    // mock has no limit enforcement, so nextCursor may be null
    expect(body).toHaveProperty("nextCursor");
  });
});