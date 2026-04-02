import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv, StaffRow } from "../middleware/rbac.js";

// ─── Mock staff data ──────────────────────────────────────────────────────────

const MANAGER: StaffRow = {
  id: "staff-manager-id",
  oidcSub: "oidc-manager-sub",
  userId: "ba-user-manager",
  role: "manager",
  isSuperUser: true,
  name: "Manager McManager",
  email: "manager@example.com",
  active: true,
  icalToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const RECEPTIONIST: StaffRow = {
  ...MANAGER,
  id: "staff-receptionist-id",
  oidcSub: "oidc-receptionist-sub",
  userId: "ba-user-receptionist",
  role: "receptionist",
  isSuperUser: false,
  name: "Receptionist Rita",
  email: "receptionist@example.com",
};

const GROOMER: StaffRow = {
  ...MANAGER,
  id: "staff-groomer-id",
  oidcSub: "oidc-groomer-sub",
  userId: "ba-user-groomer",
  role: "groomer",
  isSuperUser: false,
  name: "Groomer Gary",
  email: "groomer@example.com",
};

// ─── Mock DB ──────────────────────────────────────────────────────────────────

let staffLookupResult: StaffRow | null = null;
let managerFallbackResult: StaffRow | null = MANAGER;

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
    eq: vi.fn((_col: unknown, _val: unknown) => ({ col: _col, val: _val })),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetMocks() {
  staffLookupResult = null;
  managerFallbackResult = MANAGER;
}

/** Build a minimal Hono app with jwtPayload pre-set, then apply a middleware. */
function buildApp(
  middleware: MiddlewareHandler<AppEnv>,
  handler?: (c: Context<AppEnv>) => Response | Promise<Response>
) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", { sub: staffLookupResult?.userId ?? "unknown-sub" });
    await next();
  });
  app.use("*", middleware);
  const h = handler ?? ((c: Context<AppEnv>) => c.json({ ok: true }));
  app.get("/test", h);
  app.post("/test", h);
  return app;
}

/** Build app with staff pre-set in context (skips resolveStaffMiddleware). */
function buildWithStaff(
  staffRow: StaffRow,
  guard: MiddlewareHandler<AppEnv>
) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", { sub: staffRow.userId ?? "" });
    c.set("staff", staffRow);
    await next();
  });
  app.use("*", guard);
  app.get("/test", (c) => c.json({ ok: true }));
  app.post("/test", (c) => c.json({ ok: true }));
  return app;
}

// ─── Import middleware ────────────────────────────────────────────────────────

const { resolveStaffMiddleware, requireRole, requireSuperUser } = await import(
  "../middleware/rbac.js"
);

beforeEach(() => resetMocks());

afterEach(() => {
  delete process.env.AUTH_DISABLED;
});

// ─── resolveStaffMiddleware tests ─────────────────────────────────────────────

describe("resolveStaffMiddleware", () => {
  it("resolves staff from DB and sets it on context", async () => {
    staffLookupResult = MANAGER;
    let capturedStaff: StaffRow | null = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(capturedStaff).not.toBeNull();
    expect(capturedStaff!.id).toBe(MANAGER.id);
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
    let capturedStaff: StaffRow | null = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test", {
      headers: { "X-Dev-User-Id": GROOMER.id },
    });
    expect(res.status).toBe(200);
    expect(capturedStaff!.role).toBe("groomer");
  });

  it("dev mode: falls back to first manager when no X-Dev-User-Id header", async () => {
    process.env.AUTH_DISABLED = "true";
    managerFallbackResult = MANAGER;
    let capturedStaff: StaffRow | null = null;
    const app = buildApp(resolveStaffMiddleware, (c) => {
      capturedStaff = c.get("staff");
      return c.json({ ok: true });
    });

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(capturedStaff!.role).toBe("manager");
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

  it("groomer is blocked from manager+receptionist-only routes", async () => {
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

// ─── requireSuperUser tests ─────────────────────────────────────────────────

describe("requireSuperUser", () => {
  it("allows access when staff is a super user", async () => {
    const app = buildWithStaff(MANAGER, requireSuperUser());
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("allows access when manager is also a super user", async () => {
    // MANAGER has isSuperUser: true
    const app = buildWithStaff(MANAGER, requireSuperUser());
    const res = await app.request("/test");
    expect(res.status).toBe(200);
  });

  it("returns 403 for a non-super-user receptionist", async () => {
    // RECEPTIONIST has isSuperUser: false
    const app = buildWithStaff(RECEPTIONIST, requireSuperUser());
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/super user privileges required/i);
  });

  it("returns 403 for a non-super-user groomer", async () => {
    // GROOMER has isSuperUser: false
    const app = buildWithStaff(GROOMER, requireSuperUser());
    const res = await app.request("/test");
    expect(res.status).toBe(403);
  });

  it("returns 403 when staff record is not resolved", async () => {
    // Manually remove staff from context to simulate unresolved staff
    const testApp = new Hono<AppEnv>();
    testApp.use("*", async (c, next) => {
      c.set("jwtPayload", { sub: "test-sub" });
      // Do NOT set staff - simulate unresolved staff
      await next();
    });
    testApp.use("*", requireSuperUser());
    testApp.get("/test", (c) => c.json({ ok: true }));
    const res = await testApp.request("/test");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/staff record not resolved/i);
  });

  it("receptionist cannot grant super user status on staff PATCH", async () => {
    // This tests the inline guard in staff.ts handler, not the middleware itself,
    // but we test requireSuperUser to verify the middleware correctly blocks
    const app = buildWithStaff(RECEPTIONIST, requireSuperUser());
    const res = await app.request("/test", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSuperUser: true }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/super user privileges required/i);
  });

  it("returns 403 with JSON body for super user violation", async () => {
    const app = buildWithStaff(RECEPTIONIST, requireSuperUser());
    const res = await app.request("/test");
    expect(res.status).toBe(403);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("application/json");
  });
});
