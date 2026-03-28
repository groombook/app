import type { MiddlewareHandler } from "hono";
import { eq, getDb, staff } from "@groombook/db";

export type StaffRole = "groomer" | "receptionist" | "manager";
export type StaffRow = typeof staff.$inferSelect;

export interface AppEnv {
  Variables: {
    jwtPayload: { sub: string; email?: string; name?: string };
    staff: StaffRow;
  };
}

/**
 * Resolves the authenticated staff record from the DB and stores it in context.
 * Must be applied after authMiddleware on all protected routes.
 *
 * Dev mode (AUTH_DISABLED=true): resolves staff by X-Dev-User-Id header (Better-Auth
 * user ID), or falls back to the first manager in the DB.
 */
export const resolveStaffMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
  // Better-Auth's own routes handle their own auth — skip staff resolution
  if (c.req.path.startsWith("/api/auth/")) {
    await next();
    return;
  }

  const db = getDb();

  if (process.env.AUTH_DISABLED === "true") {
    const devUserId = c.req.header("X-Dev-User-Id");
    if (!devUserId) {
      // No header — fall back to first manager
      const [manager] = await db
        .select()
        .from(staff)
        .where(eq(staff.role, "manager"))
        .limit(1);
      if (!manager) {
        return c.json({ error: "Forbidden: no staff records found" }, 403);
      }
      c.set("staff", { ...manager, isSuperUser: true });
      await next();
      return;
    }
    // Treat X-Dev-User-Id as the Better-Auth user ID first
    const [row] = await db
      .select()
      .from(staff)
      .where(eq(staff.userId, devUserId));
    if (row) {
      c.set("staff", { ...row, isSuperUser: true });
      await next();
      return;
    }
    // Fallback: if userId is null, treat X-Dev-User-Id as staff.id (dev login
    // may send the primary key for staff records that predate the userId field)
    const [fallbackRow] = await db
      .select()
      .from(staff)
      .where(eq(staff.id, devUserId));
    if (!fallbackRow) {
      return c.json(
        { error: "Forbidden: no staff record found for X-Dev-User-Id" },
        403
      );
    }
    c.set("staff", { ...fallbackRow, isSuperUser: true });
    await next();
    return;
  }

  const jwt = c.get("jwtPayload");
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.userId, jwt.sub));
  if (row) {
    c.set("staff", row);
    await next();
    return;
  }
  // Fallback: staff records that predate the userId field may still have oidcSub
  const [fallbackRow] = await db
    .select()
    .from(staff)
    .where(eq(staff.oidcSub, jwt.sub));
  if (!fallbackRow) {
    return c.json(
      { error: "Forbidden: no staff record found for authenticated user" },
      403
    );
  }
  c.set("staff", fallbackRow);
  await next();
};

/**
 * Middleware factory that enforces one of the allowed roles.
 * Must be applied after resolveStaffMiddleware.
 *
 * @example
 *   api.use("/staff/*", requireRole("manager"));
 *   api.use("/reports/*", requireRole("manager"));
 */
export function requireRole(
  ...allowedRoles: StaffRole[]
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const staffRow = c.get("staff");
    if (!staffRow) {
      return c.json({ error: "Forbidden: staff record not resolved" }, 403);
    }
    if (!(allowedRoles as string[]).includes(staffRow.role)) {
      return c.json(
        {
          error: `Forbidden: role '${staffRow.role}' is not permitted to access this resource`,
        },
        403
      );
    }
    await next();
  };
}

/**
 * Middleware that enforces the staff member is a super user.
 * Must be applied after resolveStaffMiddleware and (typically) after requireRole.
 *
 * @example
 *   api.use("/staff/*", requireRole("manager"));
 *   api.use("/staff/*", requireSuperUser());
 */
export function requireSuperUser(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const staffRow = c.get("staff");
    if (!staffRow) {
      return c.json({ error: "Forbidden: staff record not resolved" }, 403);
    }
    if (!staffRow.isSuperUser) {
      return c.json(
        { error: "Forbidden: super user privileges required" },
        403
      );
    }
    await next();
  };
}
