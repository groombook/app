import type { MiddlewareHandler } from "hono";
import { getDb, impersonationAuditLogs } from "@groombook/db";
import type { PortalSessionEnv } from "./portalSession.js";

export const portalAuditMiddleware: MiddlewareHandler<PortalSessionEnv> = async (
  c,
  next
) => {
  await next();

  const sessionId = c.get("portalSessionId");
  if (!sessionId) return;

  const action = `${c.req.method} ${c.req.path}`;
  const metadata = { method: c.req.method, statusCode: c.res.status };

  try {
    const db = getDb();
    await db.insert(impersonationAuditLogs).values({
      sessionId,
      action,
      pageVisited: c.req.path,
      metadata,
    });
  } catch (err) {
    console.error("[portalAudit] failed to insert audit log:", err);
  }
};