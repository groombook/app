import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, getDb, appointments, impersonationSessions, waitlistEntries } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const portalRouter = new Hono<AppEnv>();

const customerNotesSchema = z.object({
  // .min(1) prevents empty strings — clearing notes is not a supported use case
  customerNotes: z.string().min(1).max(500),
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

// ─── Appointment confirm/cancel ──────────────────────────────────────────────

portalRouter.post("/appointments/:id/confirm", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

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

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);

  if (!appt) {
    return c.json({ error: "Not found" }, 404);
  }

  if (appt.clientId !== session.clientId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (appt.startTime <= new Date()) {
    return c.json({ error: "Cannot confirm a past or in-progress appointment" }, 422);
  }

  if (appt.confirmationStatus !== "pending") {
    return c.json({ error: "Appointment is not pending confirmation" }, 422);
  }

  if (appt.status === "cancelled" || appt.status === "completed") {
    return c.json({ error: "Cannot confirm a cancelled or completed appointment" }, 422);
  }

  const [updated] = await db
    .update(appointments)
    .set({ confirmationStatus: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    id: updated.id,
    confirmationStatus: updated.confirmationStatus,
    confirmedAt: updated.confirmedAt,
    updatedAt: updated.updatedAt,
  });
});

portalRouter.post("/appointments/:id/cancel", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

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

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);

  if (!appt) {
    return c.json({ error: "Not found" }, 404);
  }

  if (appt.clientId !== session.clientId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  if (appt.startTime <= new Date()) {
    return c.json({ error: "Cannot cancel a past or in-progress appointment" }, 422);
  }

  if (appt.status === "cancelled" || appt.status === "completed") {
    return c.json({ error: "Appointment is already cancelled or completed" }, 422);
  }

  const [updated] = await db
    .update(appointments)
    .set({ status: "cancelled", confirmationStatus: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, id))
    .returning();

  if (!updated) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({
    id: updated.id,
    status: updated.status,
    confirmationStatus: updated.confirmationStatus,
    cancelledAt: updated.cancelledAt,
    updatedAt: updated.updatedAt,
  });
});

// ─── Client-facing waitlist routes ───────────────────────────────────────────

const createWaitlistEntrySchema = z.object({
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  preferredDate: z.string(),
  preferredTime: z.string(),
});

const updateWaitlistEntrySchema = z.object({
  status: z.literal("cancelled").optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
});

portalRouter.post(
  "/waitlist",
  zValidator("json", createWaitlistEntrySchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const sessionId = c.req.header("X-Impersonation-Session-Id");

    let clientId: string | null = null;
    if (sessionId) {
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
      if (session && session.expiresAt > new Date()) {
        clientId = session.clientId;
      }
    }

    if (!clientId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const [entry] = await db
      .insert(waitlistEntries)
      .values({
        clientId,
        petId: body.petId,
        serviceId: body.serviceId,
        preferredDate: body.preferredDate,
        preferredTime: body.preferredTime,
      })
      .returning();

    return c.json(entry, 201);
  }
);

portalRouter.patch(
  "/waitlist/:id",
  zValidator("json", updateWaitlistEntrySchema),
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

    const [existing] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.clientId !== session.clientId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updateData.status = body.status;
    if (body.preferredDate !== undefined) updateData.preferredDate = body.preferredDate;
    if (body.preferredTime !== undefined) updateData.preferredTime = body.preferredTime;

    const [updated] = await db
      .update(waitlistEntries)
      .set(updateData)
      .where(eq(waitlistEntries.id, id))
      .returning();

    return c.json(updated);
  }
);

portalRouter.delete("/waitlist/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
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

  const [entry] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .limit(1);

  if (!entry) return c.json({ error: "Not found" }, 404);
  if (entry.clientId !== session.clientId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .returning();

  return c.json({ ok: true });
});
