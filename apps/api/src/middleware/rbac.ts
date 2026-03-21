import type { MiddlewareHandler } from "hono";
import { eq, getDb, staff } from "@groombook/db";
import type { JwtPayload } from "./auth.js";

export type StaffRole = "groomer" | "receptionist" | "manager";
export type StaffRow = typeof staff.$inferSelect;

export interface AppEnv {
  Variables: {
    jwtPayload: JwtPayload;
    staff: StaffRow;
  };
}

/**
 * Resolves the authenticated staff record from the DB and stores it in context.
 * Must be applied after authMiddleware on all protected routes.
 *
 * Dev mode (AUTH_DISABLED=true): resolves staff by X-Dev-User-Id header (treated
 * as oidcSub), or falls back to the first manager in the DB.
 */
export const resolveStaffMiddleware: MiddlewareHandler<AppEnv> = async (
  c,
  next
) => {
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
      c.set("staff", manager);
      await next();
      return;
    }
    // Treat X-Dev-User-Id as the oidcSub
    const [row] = await db
      .select()
      .from(staff)
      .where(eq(staff.oidcSub, devUserId));
    if (!row) {
      return c.json(
        { error: "Forbidden: no staff record found for X-Dev-User-Id" },
        403
      );
    }
    c.set("staff", row);
    await next();
    return;
  }

  const jwt = c.get("jwtPayload");
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.oidcSub, jwt.sub));
  if (!row) {
    return c.json(
      { error: "Forbidden: no staff record found for authenticated user" },
      403
    );
  }
  c.set("staff", row);
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
