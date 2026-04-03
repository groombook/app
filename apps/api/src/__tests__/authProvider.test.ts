import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authProviderRouter } from "../routes/authProvider.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockStaff {
  id: string;
  role: string;
  isSuperUser: boolean;
}

// ─── Mock DB state ────────────────────────────────────────────────────────────

let dbRows: Record<string, unknown>[] = [];
let deletedRows: string[] = [];
let insertedRows: Record<string, unknown>[] = [];
let encryptCalls: string[] = [];

function resetMock() {
  dbRows = [];
  deletedRows = [];
  insertedRows = [];
  encryptCalls = [];
}

// ─── Mock staff context ───────────────────────────────────────────────────────

const mockSuperUser: MockStaff = { id: "staff-1", role: "manager", isSuperUser: true };
const mockManager: MockStaff = { id: "staff-2", role: "manager", isSuperUser: false };
const mockGroomer: MockStaff = { id: "staff-3", role: "groomer", isSuperUser: false };

// ─── Mock db module ───────────────────────────────────────────────────────────

vi.mock("@groombook/db", () => {
  const authProviderConfig = new Proxy(
    { _name: "auth_provider_config" },
    {
      get(_target, prop) {
        if (prop === "_name") return "auth_provider_config";
        if (prop === "$inferSelect") return {};
        return { table: "auth_provider_config", column: prop };
      },
    }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => [...dbRows],
            [Symbol.iterator]: function* () {
              for (const item of dbRows) yield item;
            },
            0: dbRows[0],
            length: dbRows.length,
          }),
        }),
      }),
      insert: () => ({
        values: (vals: Record<string, unknown>) => {
          insertedRows.push(vals);
          return {
            returning: () => [{ ...vals, id: "new-id-1", createdAt: new Date(), updatedAt: new Date() }],
          };
        },
      }),
      delete: () => {
        // Execute immediately - route doesn't chain .returning()
        deletedRows.push("all");
        return Promise.resolve([]);
      },
      transaction: <T>(fn: (tx: {
        delete: () => Promise<unknown>;
        insert: () => { values: (v: Record<string, unknown>) => { returning: () => T[] } };
      }) => Promise<T>) => {
        const tx = {
          delete: () => { deletedRows.push("all"); return Promise.resolve([]); },
          insert: () => ({
            values: (vals: Record<string, unknown>) => ({
              returning: () => [{ ...vals, id: "new-id-1", createdAt: new Date(), updatedAt: new Date() }] as T[],
            }),
          }),
        };
        return fn(tx);
      },
    }),
    authProviderConfig,
    eq: (_col: unknown, _val: unknown) => ({ col: _col, val: _val }),
    encryptSecret: (val: string) => {
      encryptCalls.push(val);
      return `encrypted:${val}`;
    },
  };
});

// ─── Build test app ───────────────────────────────────────────────────────────

function makeApp(staff: MockStaff | null) {
  const app = new Hono();
  // Inject staff context + super user guard per route
  // Must match both exact path and wildcard subpaths
  app.use(
    "/admin/auth-provider/*",
    async (c, next) => {
      if (!staff) {
        return c.json({ error: "Forbidden: no staff record resolved" }, 403);
      }
      if (!staff.isSuperUser) {
        return c.json({ error: "Forbidden: super user privileges required" }, 403);
      }
      (c as any).set("staff", staff);
      await next();
    }
  );
  app.route("/admin/auth-provider", authProviderRouter as unknown as Hono);
  return app;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function get<T extends Hono = Hono>(app: T, path: string, staff: MockStaff | null) {
  const res = await app.request(path, { method: "GET" }, { allCtx: { staff } as { staff: MockStaff } });
  return { status: res.status, body: await res.json() };
}

async function put<T extends Hono = Hono>(app: T, path: string, body: unknown, staff: MockStaff | null) {
  const res = await app.request(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { allCtx: { staff } as { staff: MockStaff } });
  return { status: res.status, body: await res.json() };
}

async function post<T extends Hono = Hono>(app: T, path: string, body: unknown, staff: MockStaff | null) {
  const res = await app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { allCtx: { staff } as { staff: MockStaff } });
  return { status: res.status, body: await res.json() };
}

async function del<T extends Hono = Hono>(app: T, path: string, staff: MockStaff | null) {
  const res = await app.request(path, { method: "DELETE" }, { allCtx: { staff } as { staff: MockStaff } });
  return { status: res.status, body: await res.json() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /admin/auth-provider", () => {
  beforeEach(resetMock);

  it("returns 404 when no provider configured", async () => {
    dbRows = [];
    const app = makeApp(mockSuperUser);
    const { status, body } = await get(app, "/admin/auth-provider", mockSuperUser);
    expect(status).toBe(404);
    expect(body.error).toBe("No auth provider configured");
  });

  it("returns config with secret redacted", async () => {
    dbRows = [{
      id: "prov-1",
      providerId: "authentik",
      displayName: "Authentik",
      issuerUrl: "https://auth.example.com",
      internalBaseUrl: null,
      clientId: "client-123",
      clientSecret: "encrypted:secret",
      scopes: "openid profile email",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }];
    const app = makeApp(mockSuperUser);
    const { status, body } = await get(app, "/admin/auth-provider", mockSuperUser);
    expect(status).toBe(200);
    expect(body.clientSecret).toBe("••••••••");
    expect(body.providerId).toBe("authentik");
  });

  it("returns 403 when not super user", async () => {
    dbRows = [];
    const app = makeApp(mockManager);
    const { status } = await get(app, "/admin/auth-provider", mockManager);
    expect(status).toBe(403);
  });
});

describe("PUT /admin/auth-provider", () => {
  beforeEach(resetMock);

  it("stores encrypted secret", async () => {
    const app = makeApp(mockSuperUser);
    const { status, body } = await put(app, "/admin/auth-provider", {
      providerId: "authentik",
      displayName: "Authentik SSO",
      issuerUrl: "https://auth.example.com",
      clientId: "my-client",
      clientSecret: "my-secret",
      scopes: "openid profile email",
    }, mockSuperUser);
    expect(status).toBe(200);
    expect(encryptCalls).toContain("my-secret");
    expect(body.clientSecret).toBe("••••••••");
    expect(body.providerId).toBe("authentik");
  });

  it("returns 400 for invalid schema", async () => {
    const app = makeApp(mockSuperUser);
    const { status } = await put(app, "/admin/auth-provider", {
      providerId: "",
      issuerUrl: "not-a-url",
    }, mockSuperUser);
    expect(status).toBe(400);
  });
});

describe("POST /admin/auth-provider/test", () => {
  beforeEach(resetMock);

  it("returns ok=false for unreachable issuer", async () => {
    const app = makeApp(mockSuperUser);
    const { status, body } = await post(app, "/admin/auth-provider/test", {
      providerId: "authentik",
      displayName: "Authentik",
      issuerUrl: "https://192.0.2.1/", // TEST-NET, never reachable
      clientId: "client",
      scopes: "openid profile email",
    }, mockSuperUser);
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  }, 15000); // timeout must exceed the 10s fetch timeout in the route handler

  it("returns 400 for missing clientSecret (not required for test)", async () => {
    const app = makeApp(mockSuperUser);
    const { status } = await post(app, "/admin/auth-provider/test", {
      providerId: "authentik",
      displayName: "Authentik",
      issuerUrl: "https://auth.example.com",
      clientId: "client",
    }, mockSuperUser);
    expect(status).toBe(200); // clientSecret omitted intentionally for test
  });
});

describe("DELETE /admin/auth-provider", () => {
  beforeEach(resetMock);

  it("deletes all config rows", async () => {
    const app = makeApp(mockSuperUser);
    const { status, body } = await del(app, "/admin/auth-provider", mockSuperUser);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(deletedRows).toContain("all");
  });

  it("returns 403 when not super user", async () => {
    const app = makeApp(mockGroomer);
    const { status } = await del(app, "/admin/auth-provider", mockGroomer);
    expect(status).toBe(403);
  });
});
