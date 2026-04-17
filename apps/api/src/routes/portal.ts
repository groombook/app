import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, inArray } from "@groombook/db";
import { getDb, appointments, impersonationSessions, waitlistEntries, clients, pets, services, staff, invoices, invoiceLineItems } from "@groombook/db";
import { validatePortalSession } from "../middleware/portalSession.js";
import { portalAudit } from "../middleware/portalAudit.js";
import type { PortalEnv } from "../middleware/portalSession.js";

export const portalRouter = new Hono<PortalEnv>();

// Apply middleware to all portal routes
portalRouter.use("/*", validatePortalSession, portalAudit);

// ─── GET routes ──────────────────────────────────────────────────────────────

portalRouter.get("/me", async (c) => {
  const db = getDb();
  const clientId = c.get("portalClientId");

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return c.json({ error: "Not found" }, 404);

  return c.json({ id: client.id, name: client.name, email: client.email, phone: client.phone });
});

portalRouter.get("/config", async (c) => {
  return c.json({
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? "",
  });
});

portalRouter.get("/services", async (c) => {
  const db = getDb();
  const allServices = await db.select().from(services).where(eq(services.active, true));
  return c.json(allServices.map(s => ({ id: s.id, name: s.name, description: s.description, basePriceCents: s.basePriceCents, durationMinutes: s.durationMinutes })));
});

portalRouter.get("/appointments", async (c) => {
  const db = getDb();
  const clientId = c.get("portalClientId");

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
  const serviceIds = allAppts.map(a => a.serviceId).filter((id): id is string => id !== null);

  const petRows = petIds.length ? await db.select().from(pets).where(inArray(pets.id, petIds)) : [];
  const staffRows = staffIds.length ? await db.select().from(staff).where(inArray(staff.id, staffIds)) : [];
  const serviceRows = serviceIds.length ? await db.select().from(services).where(inArray(services.id, serviceIds)) : [];

  const petMap = Object.fromEntries(petRows.map(p => [p.id, p]));
  const staffMap = Object.fromEntries(staffRows.map(s => [s.id, s]));
  const serviceMap = Object.fromEntries(serviceRows.map(s => [s.id, s]));

  const appts = allAppts.map(a => ({
    id: a.id,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    confirmationStatus: a.confirmationStatus,
    customerNotes: a.customerNotes,
    notes: a.notes,
    pet: a.petId ? { id: petMap[a.petId]?.id, name: petMap[a.petId]?.name, photo: petMap[a.petId]?.photoKey } : null,
    service: a.serviceId ? { id: a.serviceId, name: serviceMap[a.serviceId]?.name, duration: serviceMap[a.serviceId]?.durationMinutes, price: serviceMap[a.serviceId]?.basePriceCents } : null,
    staff: a.staffId ? { id: staffMap[a.staffId]?.id, name: staffMap[a.staffId]?.name } : null,
  }));

  const upcoming = appts.filter(a => a.startTime > now && a.status !== "cancelled");
  const past = appts.filter(a => a.startTime <= now || a.status === "cancelled");

  return c.json({ appointments: appts });
});

portalRouter.get("/pets", async (c) => {
  const db = getDb();
  const clientId = c.get("portalClientId");

  const clientPets = await db.select().from(pets).where(eq(pets.clientId, clientId));
  return c.json(clientPets.map(p => ({ id: p.id, name: p.name, breed: p.breed, weightKg: p.weightKg, dateOfBirth: p.dateOfBirth, photoKey: p.photoKey, groomingNotes: p.groomingNotes })));
});

portalRouter.get("/invoices", async (c) => {
  const db = getDb();
  const clientId = c.get("portalClientId");

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
    date: inv.createdAt,
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
    const clientId = c.get("portalClientId");

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
  const clientId = c.get("portalClientId");

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
  const clientId = c.get("portalClientId");

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
    const clientId = c.get("portalClientId");

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
    const clientId = c.get("portalClientId");

    const [existing] = await db
      .select()
      .from(waitlistEntries)
      .where(eq(waitlistEntries.id, id))
      .limit(1);

    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.clientId !== clientId) {
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
  const clientId = c.get("portalClientId");

  const [entry] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .limit(1);

  if (!entry) return c.json({ error: "Not found" }, 404);
  if (entry.clientId !== clientId) {
    return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .returning();

  return c.json({ ok: true });
});

// ─── Payment routes ───────────────────────────────────────────────────────────

import {
  createPaymentIntent,
  listPaymentMethods,
  detachPaymentMethod,
  createSetupIntent,
  getOrCreateStripeCustomer,
  getStripeClient,
} from "../services/payment.js";

const payMultipleSchema = z.object({
  invoiceIds: z.array(z.string().uuid()).min(1),
});

portalRouter.post(
  "/invoices/pay-multiple",
  zValidator("json", payMultipleSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const clientId = c.get("portalClientId");

    const invoiceRows = await db
      .select()
      .from(invoices)
      .where(inArray(invoices.id, body.invoiceIds));

    if (invoiceRows.length !== body.invoiceIds.length) {
      return c.json({ error: "One or more invoices not found" }, 404);
    }

    for (const inv of invoiceRows) {
      if (inv.clientId !== clientId) return c.json({ error: "Forbidden" }, 403);
      if (inv.status === "draft" || inv.status === "void") {
        return c.json({ error: `Invoice ${inv.id} cannot be paid (draft or void)` }, 422);
      }
      if (inv.status === "paid") {
        return c.json({ error: `Invoice ${inv.id} is already paid` }, 422);
      }
    }

    const firstInvoice = invoiceRows[0];
    if (!firstInvoice) return c.json({ error: "No invoices found" }, 400);
    const allSameClient = invoiceRows.every(inv => inv.clientId === firstInvoice.clientId);
    if (!allSameClient) {
      return c.json({ error: "All invoices must belong to the same client" }, 422);
    }

    const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
    const result = await createPaymentIntent(body.invoiceIds, clientId);
    if (!result) return c.json({ error: "Payment service unavailable" }, 503);

    return c.json({ clientSecret: result.clientSecret, publishableKey: stripePublishableKey });
  }
);

portalRouter.get("/payment-methods", async (c) => {
  const clientId = c.get("portalClientId");

  const methods = await listPaymentMethods(clientId);
  if (methods === null) return c.json({ error: "Payment service unavailable" }, 503);
  return c.json(methods);
});

portalRouter.post("/payment-methods", async (c) => {
  const clientId = c.get("portalClientId");

  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY ?? "";
  const customerId = await getOrCreateStripeCustomer(clientId);
  if (!customerId) return c.json({ error: "Could not create customer" }, 500);

  const result = await createSetupIntent(customerId);
  if (!result) return c.json({ error: "Payment service unavailable" }, 503);

  return c.json({ clientSecret: result.clientSecret, publishableKey: stripePublishableKey });
});

portalRouter.delete("/payment-methods/:id", async (c) => {
  const clientId = c.get("portalClientId");

  const paymentMethodId = c.req.param("id");

  const stripeCustomerId = await getOrCreateStripeCustomer(clientId);
  if (!stripeCustomerId) return c.json({ error: "No payment method found" }, 404);

  const stripe = getStripeClient();
  if (!stripe) return c.json({ error: "Payment service unavailable" }, 503);

  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (!paymentMethod || paymentMethod.customer !== stripeCustomerId) {
    return c.json({ error: "Payment method not found" }, 404);
  }

  const ok = await detachPaymentMethod(paymentMethodId);
  if (!ok) return c.json({ error: "Failed to detach payment method" }, 500);
  return c.json({ ok: true });
});

// ─── Dev-mode session creation ──────────────────────────────────────────────
// Allows the dev login selector to vend an impersonation session for a client
// without requiring manager auth. Only available when AUTH_DISABLED=true.

const devSessionSchema = z.object({
  clientId: z.string().uuid(),
});

portalRouter.post(
  "/dev-session",
  zValidator("json", devSessionSchema),
  async (c) => {
    if (process.env.AUTH_DISABLED !== "true") {
      return c.json({ error: "Not available when auth is enabled" }, 403);
    }

    const db = getDb();
    const body = c.req.valid("json");

    // Verify client exists
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, body.clientId))
      .limit(1);
    if (!client) {
      return c.json({ error: "Client not found" }, 404);
    }

    // Find a staff record to associate with the dev impersonation session.
    // Use the demo-manager if it exists (created by seed with known ID),
    // otherwise fall back to the first active staff record.
    // This avoids hardcoding a UUID that may not exist in all environments.
    const DEMO_STAFF_ID = "00000000-0000-0000-0000-000000000001";

    let staffId = DEMO_STAFF_ID;
    const [demoStaff] = await db
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.id, DEMO_STAFF_ID))
      .limit(1);

    if (!demoStaff) {
      // Fall back to any active staff member
      const [firstStaff] = await db
        .select({ id: staff.id })
        .from(staff)
        .where(eq(staff.active, true))
        .limit(1);
      if (!firstStaff) {
        return c.json({ error: "No staff records found. Run the database seed." }, 500);
      }
      staffId = firstStaff.id;
    }

    const [session] = await db
      .insert(impersonationSessions)
      .values({
        staffId,
        clientId: body.clientId,
        reason: "dev-mode-client-portal",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
      .returning();

    return c.json(session, 201);
  }
);