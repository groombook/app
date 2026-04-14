import type { MiddlewareHandler } from "hono";
import { and, eq, getDb, impersonationSessions } from "@groombook/db";

export interface PortalSessionEnv {
  Variables: {
    portalClientId: string;
    portalSessionId: string;
  };
}

export const validatePortalSession: MiddlewareHandler<PortalSessionEnv> = async (
  c,
  next
) => {
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  if (!sessionId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const db = getDb();
  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(
      and(
        eq(impersonationSessions.id, sessionId),
        eq(impersonationSessions.status, "active")
      )
    )
    .limit(1);

  if (!session || session.expiresAt <= new Date()) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("portalClientId", session.clientId);
  c.set("portalSessionId", session.id);
  await next();
};