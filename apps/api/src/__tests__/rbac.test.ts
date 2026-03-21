import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../middleware/rbac.js";

// ─── Mock staff data ──────────────────────────────────────────────────────────

const MANAGER = {
  id: "staff-manager-id",
  oidcSub: "oidc-manager-sub",
  role: "manager" as const,
  name: "Manager McManager",
  email: "manager@example.com",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const RECEPTIONIST = {
  ...MANAGER,
  id: "staff-receptionist-id",
  oidcSub: "oidc-receptionist-sub",
  role: "receptionist" as const,
  name: "Receptionist Rita",
  email: "receptionist@example.com",
};

const GROOMER = {
  ...MANAGER,
  id: "staff-groomer-id",
  oidcSub: "oidc-groomer-sub",
  role: "groomer" as const,
  name: "Groomer Gary",
  email: "groomer@example.com",
};

// ─── Mock DB ──────────────────────────────────────────────────────────────────

let staffLookupResult: typeof MANAGER | null = null;
let managerFallbackResult: typeof MANAGER | null = MANAGER;

vi.mock("@groombook/db", () => {
  const staff = new Proxy(
    { _name: "staff" },
    {
      get(target, prop) {
        if (prop === "_name") return "staff";
        if (prop === "$inferSelect") return {};
        return { table: "staff", column: prop };
      },
    }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => {
              // dev mode fallback to first manager
              return managerFallbackResult ? [managerFallbackResult] : [];
            },
            // direct .where() termination (oidcSub lookup)
            then: undefined,
            [Symbol.iterator]: function* () {
              if (staffLookupResult) yield staffLookupResult;
            },
            0: staffLookupResult,
            length: staffLookupResult ? 1 : 0,
          }),
        }),
      }),
    }),
    staff,
    eq: vi.fn((_col, _val) => ({ col: _col, val: _val })),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks() {
  staffLookupResult = null;
  managerFallbackResult = MANAGER;
}

/** Build a minimal Hono app with jwtPayload already set, then apply the given middleware. */
function buildApp(
  middleware: Parameters<Hono<AppEnv>["use"]>[1],
  handler?: (c: Parameters<Parameters<Hono<AppEnv>["get"]>[1]>[0]) => Response | Promise<Response>
) {
  const app = new Hono<AppEnv>();
  // Inject jwtPayload as if authMiddleware already ran
  app.use("*", async (c, next) => {
    c.set("jwtPayload", { sub: staffLookupResult?.oidcSub ?? "unknown-sub" });
    await next();
  });
  app.use("*", middleware as never);
  app.get("/test", handler ?? ((c) => c.json({ ok: true })));
  app.post("/test", handler ?? ((c) => c.json({ ok: true })));
  return app;
}

// ─── resolveStaffMiddleware tests ─────────────────────────────────────────────

const { resolveStaffMiddleware, requireRole } = await import(
  "../middleware/rbac.js"
);

beforeEach(() => resetMocks());

afterEach(() => {
  delete process.env.AUTH_DISABLED;
});

describe("resolveStaffMiddleware", () => {
  it("resolves staff from DB and sets it on context", async () => {
    staffLookupResult = MANAGER;
    let capturedStaff: unknown = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(capturedStaff).toBeTruthy();
    expect((capturedStaff as typeof MANAGER).id).toBe(MANAGER.id);
  });

  it("returns 403 when no staff record found for the OIDC sub", async () => {
    staffLookupResult = null;
    const app = buildApp(resolveStaffMiddleware);

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/no staff record/i);
  });

  it("dev mode: resolves staff by X-Dev-User-Id header", async () => {
    process.env.AUTH_DISABLED = "true";
    staffLookupResult = GROOMER;
    let capturedStaff: unknown = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test", {
      headers: { "X-Dev-User-Id": GROOMER.oidcSub },
    });
    expect(res.status).toBe(200);
    expect((capturedStaff as typeof GROOMER).role).toBe("groomer");
  });

  it("dev mode: falls back to first manager when no X-Dev-User-Id header", async () => {
    process.env.AUTH_DISABLED = "true";
    managerFallbackResult = MANAGER;
    let capturedStaff: unknown = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect((capturedStaff as typeof MANAGER).role).toBe("manager");
  });

  it("dev mode: returns 403 when no manager exists and no header provided", async () => {
    process.env.AUTH_DISABLED = "true";
    managerFallbackResult = null;
    const app = buildApp(resolveStaffMiddleware);

    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/no staff records found/i);
  });
});

// ─── requireRole tests ────────────────────────────────────────────────────────

describe("requireRole", () => {
  /** Build app with staff pre-set in context (skips resolveStaffMiddleware). */
  function buildWithStaff(
    staffRow: typeof MANAGER,
    guard: ReturnType<typeof requireRole>
  ) {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("jwtPayload", { sub: staffRow.oidcSub });
      c.set("staff", staffRow as never);
      await next();
    });
    app.use("*", guard as never);
    app.get("/test", (c) => c.json({ ok: true }));
    app.post("/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows access when staff role matches the only allowed role", async () => {
    const app = buildWithStaff(MANAGER, requireRole("manager"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows access when staff role is one of multiple allowed roles", async () => {
    const app = buildWithStaff(RECEPTIONIST, requireRole("manager", "receptionist"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 403 for an unauthorized role", async () => {
    const app = buildWithStaff(GROOMER, requireRole("manager"));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/forbidden/i);
    expect(body.error).toContain("groomer");
  });

  it("includes the role name in the 403 error message", async () => {
    const app = buildWithStaff(RECEPTIONIST, requireRole("manager"));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("receptionist");
  });

  it("groomer is blocked from manager-only routes", async () => {
    const app = buildWithStaff(GROOMER, requireRole("manager", "receptionist"));
    const res = await app.request("/test", { method: "POST" });
    expect(res.status).toBe(403);
  });

  it("manager passes all-role checks", async () => {
    const app = buildWithStaff(MANAGER, requireRole("manager", "receptionist", "groomer"));
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 403 with JSON body (not plain text)", async () => {
    const app = buildWithStaff(GROOMER, requireRole("manager"));
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");
  });
});
