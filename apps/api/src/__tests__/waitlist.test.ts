import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const VALID_UUID_1 = "550e8400-e29b-41d4-a716-446655440001";
const VALID_UUID_2 = "550e8400-e29b-41d4-a716-446655440002";
const VALID_UUID_3 = "550e8400-e29b-41d4-a716-446655440003";
const VALID_UUID_4 = "550e8400-e29b-41d4-a716-446655440004";
const VALID_UUID_5 = "550e8400-e29b-41d4-a716-446655440005";

const WAITLIST_ENTRY = {
  id: VALID_UUID_1,
  clientId: VALID_UUID_2,
  petId: VALID_UUID_3,
  serviceId: VALID_UUID_4,
  preferredDate: "2026-03-25",
  preferredTime: "10:00",
  status: "active",
  notifiedAt: null,
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const ACTIVE_SESSION = {
  id: VALID_UUID_5,
  clientId: VALID_UUID_2,
  status: "active" as const,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  createdAt: new Date(),
};

const EXPIRED_SESSION = {
  id: "660e8400-e29b-41d4-a716-446655440006",
  clientId: VALID_UUID_2,
  status: "active" as const,
  expiresAt: new Date(Date.now() - 60 * 60 * 1000),
  createdAt: new Date(),
};

let selectRows: Record<string, unknown>[] = [];
let selectSessionRow: Record<string, unknown> | null = null;
let insertedValues: Record<string, unknown>[] = [];
let updatedValues: Record<string, unknown>[] = [];

function resetMock() {
  selectRows = [];
  selectSessionRow = null;
  insertedValues = [];
  updatedValues = [];
}

vi.mock("@groombook/db", () => {
  function makeChainable(data: unknown[]): unknown {
    const arr = [...data];
    const chain = new Proxy(arr, {
      get(target, prop) {
        if (prop === "where" || prop === "orderBy" || prop === "limit" || prop === "leftJoin") {
          return () => chain;
        }
        // @ts-expect-error proxy
        return target[prop];
      },
    });
    return chain;
  }

  const waitlistEntries = new Proxy(
    { _name: "waitlistEntries" },
    { get: (t, p) => (p === "_name" ? "waitlistEntries" : { table: "waitlistEntries", column: p }) }
  );

  const impersonationSessions = new Proxy(
    { _name: "impersonationSessions" },
    { get: (t, p) => (p === "_name" ? "impersonationSessions" : { table: "impersonationSessions", column: p }) }
  );

  const clients = new Proxy(
    { _name: "clients" },
    { get: (t, p) => (p === "_name" ? "clients" : { table: "clients", column: p }) }
  );

  const pets = new Proxy(
    { _name: "pets" },
    { get: (t, p) => (p === "_name" ? "pets" : { table: "pets", column: p }) }
  );

  const services = new Proxy(
    { _name: "services" },
    { get: (t, p) => (p === "_name" ? "services" : { table: "services", column: p }) }
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
          if (table._name === "waitlistEntries") {
            return makeChainable(selectRows);
          }
          return makeChainable([]);
        },
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          insertedValues.push(vals);
          return {
            returning: () => [{ ...WAITLIST_ENTRY, ...vals, id: "waitlist-uuid-new" }],
          };
        },
      }),
      update: () => ({
        set: (vals: Record<string, unknown>) => ({
          where: () => {
            updatedValues.push(vals);
            return {
              returning: () =>
                selectRows.length > 0
                  ? [{ ...selectRows[0], ...vals }]
                  : [],
            };
          },
        }),
      }),
      delete: () => ({
        where: () => {
          return {
            returning: () =>
              selectRows.length > 0 ? [selectRows[0]] : [],
          };
        },
      }),
    }),
    waitlistEntries,
    impersonationSessions,
    clients,
    pets,
    services,
    appointments,
    eq: vi.fn(),
    and: vi.fn(),
    lt: vi.fn(),
  };
});

const { waitlistRouter } = await import("../routes/waitlist.js");
const { portalRouter } = await import("../routes/portal.js");

const app = new Hono();
app.route("/waitlist", waitlistRouter);
app.route("/portal", portalRouter);

function jsonRequest(method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  return app.request(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => resetMock());

describe("POST /portal/waitlist", () => {
  it("creates entry with valid session", async () => {
    selectSessionRow = ACTIVE_SESSION;
    const res = await jsonRequest("POST", "/portal/waitlist", {
      petId: VALID_UUID_3,
      serviceId: VALID_UUID_4,
      preferredDate: "2026-03-25",
      preferredTime: "10:00",
    }, { "X-Impersonation-Session-Id": VALID_UUID_5 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.petId).toBe(VALID_UUID_3);
    expect(insertedValues).toHaveLength(1);
  });

  it("returns 401 without session", async () => {
    const res = await jsonRequest("POST", "/portal/waitlist", {
      petId: VALID_UUID_3,
      serviceId: VALID_UUID_4,
      preferredDate: "2026-03-25",
      preferredTime: "10:00",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired session", async () => {
    selectSessionRow = EXPIRED_SESSION;
    const res = await jsonRequest("POST", "/portal/waitlist", {
      petId: VALID_UUID_3,
      serviceId: VALID_UUID_4,
      preferredDate: "2026-03-25",
      preferredTime: "10:00",
    }, { "X-Impersonation-Session-Id": EXPIRED_SESSION.id });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /portal/waitlist/:id", () => {
  it("deletes entry with valid session and correct owner", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectRows = [WAITLIST_ENTRY];
    const res = await app.request(`/portal/waitlist/${VALID_UUID_1}`, {
      method: "DELETE",
      headers: { "X-Impersonation-Session-Id": VALID_UUID_5 },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 401 without session", async () => {
    const res = await app.request(`/portal/waitlist/${VALID_UUID_1}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 with valid session but wrong owner", async () => {
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "other-client-uuid" };
    selectRows = [WAITLIST_ENTRY];
    const res = await app.request(`/portal/waitlist/${VALID_UUID_1}`, {
      method: "DELETE",
      headers: { "X-Impersonation-Session-Id": VALID_UUID_5 },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when entry not found", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectRows = [];
    const res = await app.request("/portal/waitlist/nonexistent", {
      method: "DELETE",
      headers: { "X-Impersonation-Session-Id": VALID_UUID_5 },
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /portal/waitlist/:id", () => {
  it("updates entry with valid session and correct owner", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectRows = [WAITLIST_ENTRY];
    const res = await jsonRequest("PATCH", `/portal/waitlist/${VALID_UUID_1}`, {
      status: "cancelled",
    }, { "X-Impersonation-Session-Id": VALID_UUID_5 });
    expect(res.status).toBe(200);
    expect(updatedValues[0]?.status).toBe("cancelled");
  });

  it("returns 401 without session", async () => {
    const res = await jsonRequest("PATCH", `/portal/waitlist/${VALID_UUID_1}`, {
      status: "cancelled",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 with valid session but wrong owner", async () => {
    selectSessionRow = { ...ACTIVE_SESSION, clientId: "other-client-uuid" };
    selectRows = [WAITLIST_ENTRY];
    const res = await jsonRequest("PATCH", `/portal/waitlist/${VALID_UUID_1}`, {
      status: "cancelled",
    }, { "X-Impersonation-Session-Id": VALID_UUID_5 });
    expect(res.status).toBe(403);
  });

  it("returns 404 when entry not found", async () => {
    selectSessionRow = ACTIVE_SESSION;
    selectRows = [];
    const res = await jsonRequest("PATCH", "/portal/waitlist/nonexistent", {
      status: "cancelled",
    }, { "X-Impersonation-Session-Id": VALID_UUID_5 });
    expect(res.status).toBe(404);
  });
});
