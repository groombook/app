import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { authProviderRouter } from "../routes/authProvider.js";
import type { AppEnv, StaffRow } from "../middleware/rbac.js";

// ─── Mock staff ───────────────────────────────────────────────────────────────

const SUPER_USER: StaffRow = {
  id: "staff-super-id",
  oidcSub: "oidc-super-sub",
  userId: "ba-user-super",
  role: "manager",
  isSuperUser: true,
  name: "Super S.",
  email: "super@example.com",
  active: true,
  icalToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const NON_SUPER_USER: StaffRow = {
  ...SUPER_USER,
  id: "staff-mgr-id",
  oidcSub: "oidc-mgr-sub",
  role: "manager",
  isSuperUser: false,
  name: "Manager M.",
  email: "mgr@example.com",
};

// ─── Mock DB ─────────────────────────────────────────────────────────────────

const DB_CONFIG = {
  id: "config-id",
  providerId: "authentik",
  displayName: "Authentik",
  issuerUrl: "https://auth.example.com",
  internalBaseUrl: "http://authentik.auth.svc.cluster.local",
  clientId: "test-client-id",
  clientSecret: "iv:cipher:tag", // already encrypted
  scopes: "openid profile email",
  enabled: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

// Use vi.hoisted to create mutable state accessible to vi.mock factory
const mockState = vi.hoisted(() => {
  const state = {
    dbSelectResult: [] as unknown[],
    dbDeleteResult: { ok: true },
    dbInsertResult: null as unknown,
    dbUpdateResult: null as unknown,
    mockEq: vi.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val })),
    mockEncryptSecret: vi.fn((s: string) => `encrypted:${s}`),
  };
  return state;
});

vi.mock("@groombook/db", () => {
  const authProviderConfig = new Proxy(
    { _name: "auth_provider_config" },
    {
      get(target, prop) {
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
            limit: () => mockState.dbSelectResult,
            [Symbol.iterator]: function* () {
              for (const item of mockState.dbSelectResult) yield item;
            },
            0: mockState.dbSelectResult[0],
            length: mockState.dbSelectResult.length,
          }),
        }),
      }),
      delete: () => ({
        where: () => mockState.dbDeleteResult,
      }),
      insert: () => ({
        values: () => ({
          returning: () => [mockState.dbInsertResult],
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => [mockState.dbUpdateResult],
          }),
        }),
      }),
    }),
    authProviderConfig,
    eq: mockState.mockEq,
    encryptSecret: mockState.mockEncryptSecret,
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildApp(staff: StaffRow | null) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    if (staff) {
      c.set("staff", staff);
      c.set("jwtPayload", { sub: staff.userId ?? "" });
    }
    await next();
  });
  app.route("/", authProviderRouter);
  return app;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockState.dbSelectResult = [];
  mockState.dbInsertResult = null;
  mockState.dbUpdateResult = null;
  mockState.dbDeleteResult = { ok: true };
  vi.clearAllMocks();
  process.env.BETTER_AUTH_SECRET = "test-secret";
});

describe("GET /admin/auth-provider", () => {
  it("returns exists:false when no config in DB", async () => {
    mockState.dbSelectResult = [];
    const app = buildApp(SUPER_USER);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false, config: null });
  });

  it("returns config with secret redacted", async () => {
    mockState.dbSelectResult = [DB_CONFIG];
    const app = buildApp(SUPER_USER);
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.exists).toBe(true);
    expect(body.config.clientSecret).toBe("••••••••");
    expect(body.config.providerId).toBe("authentik");
  });

  it("returns 403 when staff is not a super user", async () => {
    const app = buildApp(NON_SUPER_USER);
    const res = await app.request("/");
    expect(res.status).toBe(403);
  });

  it("returns 403 when no staff context", async () => {
    const app = buildApp(null);
    const res = await app.request("/");
    expect(res.status).toBe(403);
  });
});

describe("PUT /admin/auth-provider", () => {
  const validBody = {
    providerId: "okta",
    displayName: "Okta SSO",
    issuerUrl: "https://okta.example.com",
    internalBaseUrl: "http://okta.okta.svc.cluster.local",
    clientId: "okta-client",
    clientSecret: "super-secret",
    scopes: "openid profile email",
  };

  it("inserts new config with encrypted secret", async () => {
    mockState.dbSelectResult = []; // no existing config
    mockState.dbInsertResult = { ...DB_CONFIG, providerId: "okta", displayName: "Okta SSO" };

    const app = buildApp(SUPER_USER);
    const res = await app.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    expect(mockState.mockEncryptSecret).toHaveBeenCalledWith("super-secret");
    const body = await res.json();
    expect(body.clientSecret).toBe("••••••••");
    expect(body.providerId).toBe("okta");
  });

  it("updates existing config with encrypted secret", async () => {
    mockState.dbSelectResult = [{ ...DB_CONFIG, id: "existing-id" }];
    mockState.dbUpdateResult = { ...DB_CONFIG, providerId: "okta", displayName: "Okta SSO Updated" };

    const app = buildApp(SUPER_USER);
    const res = await app.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, displayName: "Okta SSO Updated" }),
    });

    expect(res.status).toBe(200);
    expect(mockState.mockEncryptSecret).toHaveBeenCalledWith("super-secret");
  });

  it("returns 400 on invalid schema", async () => {
    const app = buildApp(SUPER_USER);
    const res = await app.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "" }), // missing required fields
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when not super user", async () => {
    const app = buildApp(NON_SUPER_USER);
    const res = await app.request("/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /admin/auth-provider/test", () => {
  const validBody = {
    providerId: "okta",
    issuerUrl: "https://okta.example.com",
    clientId: "okta-client",
    clientSecret: "super-secret",
  };

  it("returns ok:true with metadata on successful OIDC discovery", async () => {
    const mockMetadata = {
      issuer: "https://okta.example.com",
      authorization_endpoint: "https://okta.example.com/authorize",
      token_endpoint: "https://okta.example.com/token",
    };

    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockMetadata), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const app = buildApp(SUPER_USER);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.metadata).toEqual(mockMetadata);
  });

  it("returns ok:false with error when OIDC discovery fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404 })
    );

    const app = buildApp(SUPER_USER);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("404");
  });

  it("returns ok:false when fetch throws", async () => {
    vi.spyOn(global, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const app = buildApp(SUPER_USER);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Network error");
  });

  it("returns 400 on invalid schema", async () => {
    const app = buildApp(SUPER_USER);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "okta" }), // missing issuerUrl, clientId, clientSecret
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when not super user", async () => {
    const app = buildApp(NON_SUPER_USER);
    const res = await app.request("/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /admin/auth-provider", () => {
  it("deletes existing config and returns ok", async () => {
    mockState.dbSelectResult = [{ id: DB_CONFIG.id }];
    mockState.dbDeleteResult = { ok: true };

    const app = buildApp(SUPER_USER);
    const res = await app.request("/", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns ok:true when no config exists", async () => {
    mockState.dbSelectResult = [];

    const app = buildApp(SUPER_USER);
    const res = await app.request("/", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("No DB config");
  });

  it("returns 403 when not super user", async () => {
    const app = buildApp(NON_SUPER_USER);
    const res = await app.request("/", { method: "DELETE" });
    expect(res.status).toBe(403);
  });
});