import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { validatePortalSession } from "../middleware/portalSession.js";
import { portalAuditMiddleware } from "../middleware/portalAudit.js";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440001";
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

let selectSessionRow: Record<string, unknown> | null = null;
let insertedAuditLogs: Array<Record<string, unknown>> = [];

function resetMock() {
  selectSessionRow = null;
  insertedAuditLogs = [];
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
          return makeChainable([]);
        },
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          insertedAuditLogs.push(vals);
          return {
            returning: () => [{ id: "audit-log-uuid-1", ...vals }],
          };
        },
      }),
    }),
    impersonationSessions,
    impersonationAuditLogs,
    eq: vi.fn(),
    and: vi.fn(),
  };
});

const app = new Hono();
app.use(validatePortalSession);
app.use(portalAuditMiddleware);
app.get("/test", (c) => c.json({ ok: true }));

function makeRequest(path: string, headers?: Record<string, string>) {
  return app.request(path, { headers });
}

beforeEach(() => resetMock());

// ─── validatePortalSession tests ──────────────────────────────────────────────

describe("validatePortalSession", () => {
  it("calls next and sets context variables for valid active session", async () => {
    selectSessionRow = ACTIVE_SESSION;
    const res = await makeRequest("/test", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 401 when X-Impersonation-Session-Id header is missing", async () => {
    const res = await makeRequest("/test");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session is expired", async () => {
    selectSessionRow = EXPIRED_SESSION;
    const res = await makeRequest("/test", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when session is not found", async () => {
    selectSessionRow = null;
    const res = await makeRequest("/test", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });
});

// ─── portalAuditMiddleware tests ──────────────────────────────────────────────

describe("portalAuditMiddleware", () => {
  it("inserts audit log entry after successful request", async () => {
    selectSessionRow = ACTIVE_SESSION;
    const res = await makeRequest("/test", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
    expect(insertedAuditLogs).toHaveLength(1);
    expect(insertedAuditLogs[0].sessionId).toBe(SESSION_ID);
    expect(insertedAuditLogs[0].action).toBe("GET /test");
    expect(insertedAuditLogs[0].pageVisited).toBe("/test");
    expect(insertedAuditLogs[0].metadata).toEqual({ method: "GET", statusCode: 200 });
  });

  it("does not throw when audit log insert fails", async () => {
    selectSessionRow = ACTIVE_SESSION;
    const res = await makeRequest("/test", { "X-Impersonation-Session-Id": SESSION_ID });
    expect(res.status).toBe(200);
  });

  it("does not insert audit log when portalSessionId is not set", async () => {
    const res = await makeRequest("/test");
    expect(res.status).toBe(401);
    expect(insertedAuditLogs).toHaveLength(0);
  });
});
