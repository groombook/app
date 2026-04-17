import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ─── Mock data ────────────────────────────────────────────────────────────────

const ACTIVE_CLIENT = {
  id: "client-uuid-1",
  name: "Alice",
  email: "alice@example.com",
  phone: "555-1234",
  address: "1 Main St",
  notes: null,
  status: "active",
  disabledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DISABLED_CLIENT = {
  ...ACTIVE_CLIENT,
  id: "client-uuid-2",
  name: "Bob",
  status: "disabled",
  disabledAt: new Date(),
};

// ─── Queue-based mock DB ──────────────────────────────────────────────────────

let selectRows: Record<string, unknown>[] = [];
let appointmentRows: Record<string, unknown>[] = [];
let insertedValues: Record<string, unknown>[] = [];
let updatedValues: Record<string, unknown>[] = [];
let deletedId: string | null = null;

function resetMock() {
  selectRows = [];
  appointmentRows = [];
  insertedValues = [];
  updatedValues = [];
  deletedId = null;
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

  const clients = new Proxy(
    { _name: "clients" },
    { get: (t, p) => (p === "_name" ? "clients" : { table: "clients", column: p }) }
  );

  const appointments = new Proxy(
    { _name: "appointments" },
    { get: (t, p) => (p === "_name" ? "appointments" : { table: "appointments", column: p }) }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: (table: unknown) => {
          const tableName = (table as { _name?: string })._name;
          const rows = tableName === "appointments" ? appointmentRows : selectRows;
          return makeChainable(rows);
        },
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          insertedValues.push(vals);
          return {
            returning: () => [{ ...ACTIVE_CLIENT, ...vals, id: "client-uuid-new" }],
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
          deletedId = "client-uuid-1";
          return {
            returning: () =>
              selectRows.length > 0 ? [selectRows[0]] : [],
          };
        },
      }),
    }),
    clients,
    appointments,
    eq: vi.fn(),
    and: vi.fn(),
    or: vi.fn(),
  };
});

// ─── App setup ────────────────────────────────────────────────────────────────

const { clientsRouter } = await import("../routes/clients.js");

const app = new Hono();
app.route("/clients", clientsRouter);

function jsonRequest(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => resetMock());

// ─── GET / ────────────────────────────────────────────────────────────────────

describe("GET /clients", () => {
  it("returns active clients", async () => {
    selectRows = [ACTIVE_CLIENT];
    const res = await app.request("/clients");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
  });

  it("returns all clients when includeDisabled=true", async () => {
    selectRows = [ACTIVE_CLIENT, DISABLED_CLIENT];
    const res = await app.request("/clients?includeDisabled=true");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("returns empty array when no clients exist", async () => {
    selectRows = [];
    const res = await app.request("/clients");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe("GET /clients/:id", () => {
  it("returns a single client", async () => {
    selectRows = [ACTIVE_CLIENT];
    const res = await app.request("/clients/client-uuid-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("client-uuid-1");
    expect(body.name).toBe("Alice");
  });

  it("returns 404 for a nonexistent client", async () => {
    selectRows = [];
    const res = await app.request("/clients/nonexistent");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });
});

// ─── POST / ───────────────────────────────────────────────────────────────────

describe("POST /clients", () => {
  it("creates a client with valid data", async () => {
    const res = await jsonRequest("POST", "/clients", {
      name: "Charlie",
      email: "charlie@example.com",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Charlie");
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.name).toBe("Charlie");
  });

  it("creates a client with required fields", async () => {
    const res = await jsonRequest("POST", "/clients", { name: "Dana", email: "dana@example.com" });
    expect(res.status).toBe(201);
    expect(insertedValues[0]!.name).toBe("Dana");
  });

  it("rejects empty name", async () => {
    const res = await jsonRequest("POST", "/clients", { name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await jsonRequest("POST", "/clients", {
      name: "Eve",
      email: "not-an-email",
    });
    expect(res.status).toBe(400);
  });

  it("rejects missing body", async () => {
    const res = await app.request("/clients", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

describe("PATCH /clients/:id", () => {
  it("updates client fields", async () => {
    selectRows = [ACTIVE_CLIENT];
    const res = await jsonRequest("PATCH", "/clients/client-uuid-1", {
      name: "Alice Updated",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Alice Updated");
    expect(updatedValues[0]!.name).toBe("Alice Updated");
  });

  it("sets disabledAt when status is set to disabled", async () => {
    selectRows = [ACTIVE_CLIENT];
    await jsonRequest("PATCH", "/clients/client-uuid-1", {
      status: "disabled",
    });
    expect(updatedValues[0]!.status).toBe("disabled");
    expect(updatedValues[0]!.disabledAt).toBeDefined();
  });

  it("clears disabledAt when re-enabling", async () => {
    selectRows = [DISABLED_CLIENT];
    await jsonRequest("PATCH", "/clients/client-uuid-2", {
      status: "active",
    });
    expect(updatedValues[0]!.disabledAt).toBeNull();
  });

  it("returns 404 when client not found", async () => {
    selectRows = [];
    const res = await jsonRequest("PATCH", "/clients/nonexistent", {
      name: "Ghost",
    });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

describe("DELETE /clients/:id", () => {
  it("requires ?confirm=true", async () => {
    const res = await app.request("/clients/client-uuid-1", {
      method: "DELETE",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/confirm/i);
  });

  it("deletes a client with ?confirm=true", async () => {
    selectRows = [ACTIVE_CLIENT];
    const res = await app.request("/clients/client-uuid-1?confirm=true", {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(deletedId).toBe("client-uuid-1");
  });

  it("returns 404 when client not found", async () => {
    selectRows = [];
    const res = await app.request("/clients/nonexistent?confirm=true", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
