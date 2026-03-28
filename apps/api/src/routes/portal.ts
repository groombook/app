import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, lt, gt, ne, lte, getDb, appointments, impersonationSessions, waitlistEntries, clients, pets, services, staff, invoices, invoiceLineItems, groomingVisitLogs } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const portalRouter = new Hono<AppEnv>();

// ─── Session helper ───────────────────────────────────────────────────────────

async function getClientIdFromSession(sessionId: string | null): Promise<string | null> {
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
  const allServices = await db.select().from(services).where(eq(services.isActive, true));
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
      groomerNotes: appointments.groomerNotes,
      petId: appointments.petId,
      serviceId: appointments.serviceId,
      staffId: appointments.staffId,
      reportCardId: appointments.reportCardId,
    })
    .from(appointments)
    .where(eq(appointments.clientId, clientId))
    .orderBy(appointments.startTime);

  const petIds = [...new Set(allAppts.map(a => a.petId).filter(Boolean))];
  const staffIds = [...new Set(allAppts.map(a => a.staffId).filter(Boolean))];

  const petRows = petIds.length ? await db.select().from(pets).where(lte(pets.id, petIds[petIds.length - 1] || "")) : [];
  const staffRows = staffIds.length ? await db.select().from(staff).where(lte(staff.id, staffIds[staffIds.length - 1] || "")) : [];

  const petMap = Object.fromEntries(petRows.map(p => [p.id, p]));
  const staffMap = Object.fromEntries(staffRows.map(s => [s.id, s]));

  const appts = allAppts.map(a => ({
    id: a.id,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    confirmationStatus: a.confirmationStatus,
    customerNotes: a.customerNotes,
    groomerNotes: a.groomerNotes,
    reportCardId: a.reportCardId,
    pet: a.petId ? { id: petMap[a.petId]?.id, name: petMap[a.petId]?.name, photo: petMap[a.petId]?.photoUrl } : null,
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
  return c.json(clientPets.map(p => ({ id: p.id, name: p.name, breed: p.breed, weight: p.weight, birthDate: p.birthDate, photoUrl: p.photoUrl, notes: p.notes })));
});

portalRouter.get("/invoices", async (c) => {
  const db = getDb();
  const sessionId = c.req.header("X-Impersonation-Session-Id");
  const clientId = await getClientIdFromSession(sessionId);
  if (!clientId) return c.json({ error: "Unauthorized" }, 401);

  const clientInvoices = await db.select().from(invoices).where(eq(invoices.clientId, clientId));
  const invoiceIds = clientInvoices.map(i => i.id);
  const lineItems = invoiceIds.length ? await db.select().from(invoiceLineItems).where(lte(invoiceLineItems.invoiceId, invoiceIds[invoiceIds.length - 1] || "")) : [];

  const itemsByInvoice = Object.groupBy(lineItems, li => li.invoiceId);

  return c.json(clientInvoices.map(inv => ({
    id: inv.id,
    status: inv.status,
    totalCents: inv.totalCents,
    createdAt: inv.createdAt,
    dueDate: inv.dueDate,
    lineItems: (itemsByInvoice[inv.id] || []).map(li => ({ id: li.id, description: li.description, quantity: li.quantity, unitPriceCents: li.unitPriceCents, totalCents: li.totalCents })),
  })));
});

// ─── Existing PATCH /appointments/:id/notes route ─────────────────────────────
// (keep all existing routes below - do not remove or modify anything below this line)