import type { MiddlewareHandler } from "hono";
import { getDb, impersonationAuditLogs } from "@groombook/db";
import type { PortalEnv } from "./portalSession.js";

/**
 * Server-side audit logging middleware for portal routes.
 * Applied after validatePortalSession in the middleware chain.
 *
 * After the route handler completes (await next()), inserts an audit log entry
 * into impersonationAuditLogs:
 *   - sessionId: from c.get("portalSessionId")
 *   - action: "{METHOD} {routePath}" (e.g., "GET /portal/appointments")
 *   - pageVisited: c.req.path
 *   - metadata: { method, statusCode: c.res.status }
 *
 * Log entries are written for both success and error responses.
 * Does NOT throw if audit logging fails — errors are logged but the user's
 * request is not affected.
 */
export const portalAudit: MiddlewareHandler<PortalEnv> = async (c, next) => {
  await next();

  const sessionId = c.get("portalSessionId");
  if (!sessionId) return;

  const method = c.req.method;
  const routePath = c.req.path;
  const pageVisited = c.req.path;
  const statusCode = c.res.status;

  try {
    const db = getDb();
    await db
      .insert(impersonationAuditLogs)
      .values({
        sessionId,
        action: `${method} ${routePath}`,
        pageVisited,
        metadata: { method, statusCode },
      })
      .returning();
  } catch (err) {
    console.error("[portalAudit] Failed to write audit log:", err);
  }
};
