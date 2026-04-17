import type { MiddlewareHandler } from "hono";
import { and, eq, getDb, impersonationSessions } from "@groombook/db";

export interface PortalEnv {
  Variables: {
    portalClientId: string;
    portalSessionId: string;
  };
}

/**
 * Validates the X-Impersonation-Session-Id header against the impersonationSessions table.
 * Must be applied to all portal routes.
 *
 * Reads x-session-id from request headers, queries impersonationSessions for a row where
 * id = sessionId AND status = 'active', and checks session.expiresAt > new Date().
 * Returns 401 if session is invalid/missing/expired.
 * On success, sets c.set("portalClientId", session.clientId) and c.set("portalSessionId", session.id).
 */
export const validatePortalSession: MiddlewareHandler<PortalEnv> = async (c, next) => {
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  if (!sessionId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(and(eq(impersonationSessions.id, sessionId), eq(impersonationSessions.status, "active")))
    .limit(1);

  if (!session || session.expiresAt <= new Date()) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("portalClientId", session.clientId);
  c.set("portalSessionId", session.id);
  await next();
};
