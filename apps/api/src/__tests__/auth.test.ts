import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mutable state to control mock behavior per test
let dbSelectResult: unknown[] = [];
const mockEq = vi.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val }));
const mockDecryptSecret = vi.fn((s: string) => `decrypted:${s}`);

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
            limit: () => dbSelectResult,
            [Symbol.iterator]: function* () {
              for (const item of dbSelectResult) yield item;
            },
            0: dbSelectResult[0],
            length: dbSelectResult.length,
          }),
        }),
      }),
    }),
    authProviderConfig,
    eq: mockEq,
    decryptSecret: mockDecryptSecret,
  };
});

async function reimportAuth() {
  vi.resetModules();
  vi.doMock("@groombook/db", () => ({
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => dbSelectResult,
            [Symbol.iterator]: function* () {
              for (const item of dbSelectResult) yield item;
            },
            0: dbSelectResult[0],
            length: dbSelectResult.length,
          }),
        }),
      }),
    }),
    authProviderConfig: {},
    eq: mockEq,
    decryptSecret: mockDecryptSecret,
  }));
  const mod = await import("../lib/auth.js");
  return mod;
}

describe("auth init", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    dbSelectResult = [];
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("falls back to env vars when DB returns empty", async () => {
    process.env = {
      ...originalEnv,
      OIDC_ISSUER: "https://issuer.example.com",
      OIDC_CLIENT_ID: "test-client-id",
      OIDC_CLIENT_SECRET: "test-client-secret",
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      NODE_ENV: "test",
    };

    const { initAuth, getAuth } = await reimportAuth();
    await initAuth();
    expect(getAuth()).toBeDefined();
  });

  it("uses DB config and decrypts clientSecret when DB has enabled provider", async () => {
    const dbConfig = {
      id: "config-id",
      providerId: "okta",
      displayName: "Okta",
      issuerUrl: "https://okta.example.com",
      internalBaseUrl: null,
      clientId: "okta-client-id",
      clientSecret: "encrypted:okta-secret",
      scopes: "openid profile email",
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    dbSelectResult = [dbConfig];

    process.env = {
      ...originalEnv,
      BETTER_AUTH_SECRET: "test-secret",
      BETTER_AUTH_URL: "http://localhost:3000",
      NODE_ENV: "test",
    };

    const { initAuth, getAuth } = await reimportAuth();
    await initAuth();
    expect(getAuth()).toBeDefined();
    expect(mockDecryptSecret).toHaveBeenCalledWith("encrypted:okta-secret");
  });

  it("throws when BETTER_AUTH_SECRET is missing and AUTH_DISABLED is not set", async () => {
    process.env = {
      ...originalEnv,
      OIDC_ISSUER: "",
      OIDC_CLIENT_ID: "",
      OIDC_CLIENT_SECRET: "",
      NODE_ENV: "test",
    };
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.AUTH_DISABLED;

    const { initAuth } = await reimportAuth();
    await expect(initAuth()).rejects.toThrow(
      "[FATAL] BETTER_AUTH_SECRET environment variable is required when auth is enabled"
    );
  });

  it("builds placeholder auth when AUTH_DISABLED=true without throwing", async () => {
    process.env = {
      ...originalEnv,
      AUTH_DISABLED: "true",
      NODE_ENV: "test",
      BETTER_AUTH_SECRET: "placeholder-for-test-only",
    };

    const { initAuth, getAuth } = await reimportAuth();
    await expect(initAuth()).resolves.toBeUndefined();
    expect(getAuth()).toBeDefined();
  });
});
