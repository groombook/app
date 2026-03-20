import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { JwtPayload } from "../middleware/auth.js";

// ─── Mock data ───────────────────────────────────────────────────────────────

const MANAGER_STAFF = {
  id: "staff-manager-id",
  oidcSub: "oidc-manager-sub",
  role: "manager",
  name: "Manager",
};

const GROOMER_STAFF = {
  id: "staff-groomer-id",
  oidcSub: "oidc-groomer-sub",
  role: "groomer",
  name: "Groomer",
};

const CLIENT = { id: "aabbccdd-1111-2222-3333-444444444444", name: "Fido Owner" };

const futureDate = () => new Date(Date.now() + 30 * 60_000);
const pastDate = () => new Date(Date.now() - 5 * 60_000);

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-uuid-1",
    staffId: MANAGER_STAFF.id,
    clientId: CLIENT.id,
    reason: "Testing portal",
    status: "active" as string,
    startedAt: new Date(),
    endedAt: null as Date | null,
    expiresAt: futureDate(),
    createdAt: new Date(),
    ...overrides,
  };
}

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-uuid-1",
    sessionId: "session-uuid-1",
    action: "session_started",
    pageVisited: null,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ─── Queue-based mock DB ─────────────────────────────────────────────────────

let selectQueue: unknown[][] = [];
let insertedValues: Array<{ table: string; vals: unknown }> = [];
let updatedValues: Array<{ table: string; set: Record<string, unknown> }> = [];

function resetMock() {
  selectQueue = [];
  insertedValues = [];
  updatedValues = [];
}

/**
 * Returns a chainable object that acts like a drizzle query result.
 * Any method call (.where, .orderBy, .limit) returns the same chainable,
 * but the FIRST terminal call (.where or .orderBy when no further chain)
 * resolves the result from the queue.
 *
 * To handle `.where().orderBy()` chaining, we make the result of shifting
 * also have .orderBy/.limit methods, and we wrap the shifted array in a proxy.
 */
function makeChainableResult(data: unknown[]): unknown {
  // Make data act both as array and as chainable
  const arr = [...data];
  return new Proxy(arr, {
    get(target, prop) {
      if (prop === "orderBy" || prop === "limit") {
        // Further chaining just returns the same data
        return () => makeChainableResult(data);
      }
      // @ts-expect-error proxy access
      return target[prop];
    },
  });
}

vi.mock("@groombook/db", () => {
  function makeTable(name: string) {
    return new Proxy(
      { _name: name },
      {
        get(target, prop) {
          if (prop === "_name") return name;
          if (prop === "$inferSelect") return {};
          return { table: name, column: prop };
        },
      }
    );
  }

  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => {
            const data = selectQueue.shift() ?? [];
            return makeChainableResult(data);
          },
          orderBy: () => {
            const data = selectQueue.shift() ?? [];
            return makeChainableResult(data);
          },
          limit: () => {
            const data = selectQueue.shift() ?? [];
            return makeChainableResult(data);
          },
        }),
      }),
      insert: (table: { _name: string }) => ({
        values: (vals: unknown) => {
          const tableName = table?._name ?? "unknown";
          insertedValues.push({ table: tableName, vals });
          return {
            returning: () => {
              if (tableName === "sessions") {
                return [makeSession(vals as Record<string, unknown>)];
              }
              return [makeAuditLog(vals as Record<string, unknown>)];
            },
          };
        },
      }),
      update: (table: { _name: string }) => ({
        set: (data: Record<string, unknown>) => ({
          where: () => {
            const tableName = table?._name ?? "unknown";
            updatedValues.push({ table: tableName, set: data });
            return {
              returning: () => {
                const base = makeSession();
                return [{ ...base, ...data }];
              },
            };
          },
        }),
      }),
    }),
    staff: makeTable("staff"),
    clients: makeTable("clients"),
    impersonationSessions: makeTable("sessions"),
    impersonationAuditLogs: makeTable("auditLogs"),
    eq: vi.fn(),
    and: vi.fn(),
    desc: vi.fn(),
  };
});

// ─── App setup ───────────────────────────────────────────────────────────────

const { impersonationRouter } = await import("../routes/impersonation.js");

function createApp(sub: string) {
  const app = new Hono<{ Variables: { jwtPayload: JwtPayload } }>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", { sub } as JwtPayload);
    await next();
  });
  app.route("/impersonation", impersonationRouter);
  return app;
}

function jsonPost(path: string, body: unknown) {
  return {
    method: "POST" as const,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => resetMock());

// ─── POST /sessions — Create session ─────────────────────────────────────────

describe("POST /impersonation/sessions", () => {
  it("creates a session for a manager", async () => {
    const app = createApp("oidc-manager-sub");
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [CLIENT], // client lookup
      [], // expireTimedOutSessions active query
      [] // existing active check
    );

    const res = await app.request(
      "/impersonation/sessions",
      jsonPost("/impersonation/sessions", { clientId: CLIENT.id })
    );

    expect(res.status).toBe(201);
    expect(insertedValues.some((v) => v.table === "sessions")).toBe(true);
    expect(insertedValues.some((v) => v.table === "auditLogs")).toBe(true);
  });

  it("rejects non-managers", async () => {
    const app = createApp("oidc-groomer-sub");
    selectQueue.push([GROOMER_STAFF]);

    const res = await app.request(
      "/impersonation/sessions",
      jsonPost("/impersonation/sessions", { clientId: CLIENT.id })
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/only managers/i);
  });

  it("returns 403 when staff record not found", async () => {
    const app = createApp("unknown-sub");
    selectQueue.push([]);

    const res = await app.request(
      "/impersonation/sessions",
      jsonPost("/impersonation/sessions", { clientId: CLIENT.id })
    );

    expect(res.status).toBe(403);
  });

  it("returns 404 when client not found", async () => {
    const app = createApp("oidc-manager-sub");
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [] // client not found
    );

    const res = await app.request(
      "/impersonation/sessions",
      jsonPost("/impersonation/sessions", { clientId: CLIENT.id })
    );

    expect(res.status).toBe(404);
  });

  it("returns 409 when active session already exists", async () => {
    const app = createApp("oidc-manager-sub");
    const existing = makeSession();
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [CLIENT], // client lookup
      [], // expireTimedOutSessions
      [existing] // existing active session
    );

    const res = await app.request(
      "/impersonation/sessions",
      jsonPost("/impersonation/sessions", { clientId: CLIENT.id })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already have an active/i);
  });
});

// ─── GET /sessions/:id — Authorization ───────────────────────────────────────

describe("GET /impersonation/sessions/:id", () => {
  it("returns session for the owning staff member", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession();
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [session] // session lookup
    );

    const res = await app.request("/impersonation/sessions/session-uuid-1");
    expect(res.status).toBe(200);
  });

  it("returns 403 for a different staff member", async () => {
    const app = createApp("oidc-groomer-sub");
    const session = makeSession(); // owned by manager
    selectQueue.push(
      [GROOMER_STAFF], // resolveStaff
      [session] // session lookup
    );

    const res = await app.request("/impersonation/sessions/session-uuid-1");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not your session/i);
  });

  it("returns 404 for nonexistent session", async () => {
    const app = createApp("oidc-manager-sub");
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [] // no session
    );

    const res = await app.request("/impersonation/sessions/nonexistent");
    expect(res.status).toBe(404);
  });

  it("auto-expires a timed-out session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ expiresAt: pastDate() });
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [session] // session lookup
    );

    const res = await app.request("/impersonation/sessions/session-uuid-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("expired");
    // Should have called update to mark expired
    expect(updatedValues).toHaveLength(1);
    expect(updatedValues[0]!.set.status).toBe("expired");
  });
});

// ─── POST /sessions/:id/extend ───────────────────────────────────────────────

describe("POST /impersonation/sessions/:id/extend", () => {
  it("extends an active non-expired session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession();
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [session] // session lookup
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/extend",
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    // Should have extended (updated expiresAt) and logged
    expect(updatedValues).toHaveLength(1);
    expect(insertedValues.some((v) => {
      const vals = v.vals as Record<string, unknown>;
      return vals.action === "session_extended";
    })).toBe(true);
  });

  it("returns 400 when extending a time-expired session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ expiresAt: pastDate() });
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [session] // session lookup
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/extend",
      { method: "POST" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 403 for non-owner", async () => {
    const app = createApp("oidc-groomer-sub");
    const session = makeSession();
    selectQueue.push(
      [GROOMER_STAFF], // resolveStaff
      [session] // owned by manager
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/extend",
      { method: "POST" }
    );
    expect(res.status).toBe(403);
  });

  it("returns 400 for an ended session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ status: "ended" });
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/extend",
      { method: "POST" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not active/i);
  });
});

// ─── POST /sessions/:id/end ──────────────────────────────────────────────────

describe("POST /impersonation/sessions/:id/end", () => {
  it("ends an active non-expired session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession();
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/end",
      { method: "POST" }
    );
    expect(res.status).toBe(200);
    expect(updatedValues).toHaveLength(1);
    expect(updatedValues[0]!.set.status).toBe("ended");
  });

  it("returns 400 when ending a time-expired session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ expiresAt: pastDate() });
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/end",
      { method: "POST" }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 403 for non-owner", async () => {
    const app = createApp("oidc-groomer-sub");
    const session = makeSession();
    selectQueue.push(
      [GROOMER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/end",
      { method: "POST" }
    );
    expect(res.status).toBe(403);
  });
});

// ─── POST /sessions/:id/log — Authorization + expiry ─────────────────────────

describe("POST /impersonation/sessions/:id/log", () => {
  const logBody = { action: "page_visit", pageVisited: "/dashboard" };

  it("logs an audit entry for the session owner", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession();
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/log",
      jsonPost("/", logBody)
    );
    expect(res.status).toBe(201);
    expect(insertedValues.some((v) => v.table === "auditLogs")).toBe(true);
  });

  it("returns 403 for non-owner", async () => {
    const app = createApp("oidc-groomer-sub");
    const session = makeSession();
    selectQueue.push(
      [GROOMER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/log",
      jsonPost("/", logBody)
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not your session/i);
  });

  it("returns 400 when session has expired by time", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ expiresAt: pastDate() });
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/log",
      jsonPost("/", logBody)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/expired/i);
  });

  it("returns 400 for an ended session", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession({ status: "ended" });
    selectQueue.push(
      [MANAGER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/log",
      jsonPost("/", logBody)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not active/i);
  });
});

// ─── GET /sessions/:id/audit-log — Authorization ────────────────────────────

describe("GET /impersonation/sessions/:id/audit-log", () => {
  it("returns audit logs for the session owner", async () => {
    const app = createApp("oidc-manager-sub");
    const session = makeSession();
    const logs = [makeAuditLog(), makeAuditLog({ id: "audit-uuid-2", action: "page_visit" })];
    selectQueue.push(
      [MANAGER_STAFF], // resolveStaff
      [session], // session lookup
      logs // audit logs query (where + orderBy chain)
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/audit-log"
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("returns 403 for non-owner", async () => {
    const app = createApp("oidc-groomer-sub");
    const session = makeSession();
    selectQueue.push(
      [GROOMER_STAFF],
      [session]
    );

    const res = await app.request(
      "/impersonation/sessions/session-uuid-1/audit-log"
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/not your session/i);
  });

  it("returns 404 for nonexistent session", async () => {
    const app = createApp("oidc-manager-sub");
    selectQueue.push(
      [MANAGER_STAFF],
      []
    );

    const res = await app.request(
      "/impersonation/sessions/nonexistent/audit-log"
    );
    expect(res.status).toBe(404);
  });
});
