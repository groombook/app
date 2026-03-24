import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, getDb, appointments, impersonationSessions } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const portalRouter = new Hono<AppEnv>();

const customerNotesSchema = z.object({
  customerNotes: z.string().max(500),
});

portalRouter.patch(
  "/appointments/:id/notes",
  zValidator("json", customerNotesSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const sessionId = c.req.header("X-Impersonation-Session-Id");
    if (!sessionId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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

    const authClientId = session.clientId;

    const [appt] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    if (!appt) {
      return c.json({ error: "Not found" }, 404);
    }

    if (appt.clientId !== authClientId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    if (appt.startTime <= new Date()) {
      return c.json({ error: "Cannot edit notes for past or in-progress appointments" }, 422);
    }

    const [updated] = await db
      .update(appointments)
      .set({ customerNotes: body.customerNotes, updatedAt: new Date() })
      .where(eq(appointments.id, id))
      .returning();

if (!updated) {
      return c.json({ error: "Not found" }, 404);
    }

    return c.json({
      id: updated.id,
      customerNotes: updated.customerNotes,
      updatedAt: updated.updatedAt,
    });
  }
);
