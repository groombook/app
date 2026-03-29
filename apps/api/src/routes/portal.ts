import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, inArray } from "@groombook/db";
import { getDb, appointments, impersonationSessions, waitlistEntries, clients, pets, services, staff, invoices, invoiceLineItems } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const portalRouter = new Hono<AppEnv>();

// ─── Session helper ───────────────────────────────────────────────────────────

async function getClientIdFromSession(sessionId: string | null | undefined): Promise<string | null> {
  if (!sessionId) return null;
  const db = getDb();
  const [session] = await db
    .select()
    .from(impersonationSessions)
    .where(and(eq(impersonationSessions.id, sessionId), eq(impersonationSessions.status, "active")))
    .limit(1);
  if (!session || session.expiresAt <= new Date()) return null;
  return session.clientId;
}

// ─── GET routes ──────────────────────────────────────────────────────────────

portalRouter.get("/me", async (c) => {
  const db = getDb();
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return c.json({ error: "Not found" }, 404);

  return c.json({ id: client.id, name: client.name, email: client.email, phone: client.phone });
});

portalRouter.get("/services", async (c) => {
  const db = getDb();
  const allServices = await db.select().from(services).where(eq(services.active, true));
  return c.json(allServices.map(s => ({ id: s.id, name: s.name, description: s.description, basePriceCents: s.basePriceCents, durationMinutes: s.durationMinutes })));
});

portalRouter.get("/appointments", async (c) => {
  const db = getDb();
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);

  const now = new Date();
  const allAppts = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      confirmationStatus: appointments.confirmationStatus,
      customerNotes: appointments.customerNotes,
      notes: appointments.notes,
      petId: appointments.petId,
      serviceId: appointments.serviceId,
      staffId: appointments.staffId,
    })
    .from(appointments)
    .where(eq(appointments.clientId, clientId))
    .orderBy(appointments.startTime);

  const petIds = allAppts.map(a => a.petId).filter((id): id is string => id !== null);
  const staffIds = allAppts.map(a => a.staffId).filter((id): id is string => id !== null);

  const petRows = petIds.length ? await db.select().from(pets).where(inArray(pets.id, petIds)) : [];
  const staffRows = staffIds.length ? await db.select().from(staff).where(inArray(staff.id, staffIds)) : [];

  const petMap = Object.fromEntries(petRows.map(p => [p.id, p]));
  const staffMap = Object.fromEntries(staffRows.map(s => [s.id, s]));

  const appts = allAppts.map(a => ({
    id: a.id,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    confirmationStatus: a.confirmationStatus,
    customerNotes: a.customerNotes,
    notes: a.notes,
    pet: a.petId ? { id: petMap[a.petId]?.id, name: petMap[a.petId]?.name, photo: petMap[a.petId]?.photoKey } : null,
    service: a.serviceId ? { id: a.serviceId } : null,
    staff: a.staffId ? { id: staffMap[a.staffId]?.id, name: staffMap[a.staffId]?.name } : null,
  }));

  const upcoming = appts.filter(a => a.startTime > now && a.status !== "cancelled");
  const past = appts.filter(a => a.startTime <= now || a.status === "cancelled");

  return c.json({ upcoming, past });
});

portalRouter.get("/pets", async (c) => {
  const db = getDb();
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);

  const clientPets = await db.select().from(pets).where(eq(pets.clientId, clientId));
  return c.json(clientPets.map(p => ({ id: p.id, name: p.name, breed: p.breed, weightKg: p.weightKg, dateOfBirth: p.dateOfBirth, photoKey: p.photoKey, groomingNotes: p.groomingNotes })));
});

portalRouter.get("/invoices", async (c) => {
  const db = getDb();
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);

  const clientInvoices = await db.select().from(invoices).where(eq(invoices.clientId, clientId));
  const invoiceIds = clientInvoices.map(i => i.id);
  const lineItems = invoiceIds.length ? await db.select().from(invoiceLineItems).where(inArray(invoiceLineItems.invoiceId, invoiceIds)) : [];

  const itemsByInvoice: Record<string, typeof lineItems> = {};
  for (const li of lineItems) {
    if (!itemsByInvoice[li.invoiceId]) itemsByInvoice[li.invoiceId] = [];
    itemsByInvoice[li.invoiceId]!.push(li);
  }

  return c.json(clientInvoices.map(inv => ({
    id: inv.id,
    status: inv.status,
    totalCents: inv.totalCents,
    createdAt: inv.createdAt,
    lineItems: (itemsByInvoice[inv.id] || []).map(li => ({ id: li.id, description: li.description, quantity: li.quantity, unitPriceCents: li.unitPriceCents, totalCents: li.totalCents })),
  })));
});

// ─── Appointment action routes ────────────────────────────────────────────────

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
    const clientId = await getClientIdFromSession(sessionId);
    if (!clientId) {
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

    if (appt.clientId !== clientId) {
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
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) {
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

  if (appt.clientId !== clientId) {
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
    id: updated!.id,
    confirmationStatus: updated!.confirmationStatus,
    confirmedAt: updated!.confirmedAt,
    updatedAt: updated!.updatedAt,
  });
});

portalRouter.post("/appointments/:id/cancel", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) {
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

  if (appt.clientId !== clientId) {
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
    id: updated!.id,
    status: updated!.status,
    confirmationStatus: updated!.confirmationStatus,
    cancelledAt: updated!.cancelledAt,
    updatedAt: updated!.updatedAt,
  });
});

// ─── Client-facing waitlist routes ────────────────────────────────────────────

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