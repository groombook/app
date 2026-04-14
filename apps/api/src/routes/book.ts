import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  and,
  eq,
  gt,
  gte,
  lt,
  ne,
  getDb,
  services,
  staff,
  appointments,
  clients,
  pets,
} from "@groombook/db";
import {
  generateAvailableSlots,
  BUSINESS_START_HOUR,
  BUSINESS_END_HOUR,
} from "../lib/slots.js";

export const bookRouter = new Hono();

// ─── GET /api/book/services ─────────────────────────────────────────────────
// Public: list active services for the booking flow

bookRouter.get("/services", async (c) => {
  const db = getDb();
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.active, true))
    .orderBy(services.name);
  return c.json(rows);
});

// ─── GET /api/book/availability ─────────────────────────────────────────────
// Public: return ISO startTime strings for slots where ≥1 groomer is free
// Query params: serviceId (uuid), date (YYYY-MM-DD)

bookRouter.get("/availability", async (c) => {
  const serviceId = c.req.query("serviceId");
  const dateStr = c.req.query("date");

  if (!serviceId || !dateStr) {
    return c.json({ error: "serviceId and date are required" }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  }

  const db = getDb();
  const [service] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, serviceId), eq(services.active, true)));
  if (!service) return c.json({ error: "Service not found" }, 404);

  const groomers = await db
    .select({ id: staff.id })
    .from(staff)
    .where(and(eq(staff.active, true), eq(staff.role, "groomer")));

  if (groomers.length === 0) return c.json([]);

  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  dayStart.setUTCHours(BUSINESS_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(`${dateStr}T00:00:00Z`);
  dayEnd.setUTCHours(BUSINESS_END_HOUR, 0, 0, 0);

  // Fetch all active appointments for the day (any groomer)
  const booked = await db
    .select({
      staffId: appointments.staffId,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
    })
    .from(appointments)
    .where(
      and(
        gte(appointments.startTime, dayStart),
        lt(appointments.startTime, dayEnd),
        ne(appointments.status, "cancelled"),
        ne(appointments.status, "no_show"),
      )
    );

  const slots = generateAvailableSlots({
    dateStr,
    durationMinutes: service.durationMinutes,
    groomerIds: groomers.map((g) => g.id),
    booked,
  });

  return c.json(slots);
});

// ─── POST /api/book/appointments ─────────────────────────────────────────────
// Public: create a booking. Finds or creates client by email, always creates pet.

const bookingSchema = z.object({
  serviceId: z.string().uuid(),
  startTime: z.string().datetime().refine(
    (dt) => new Date(dt) > new Date(),
    { message: "Appointment must be in the future" }
  ),
  clientName: z.string().min(1).max(200),
  clientEmail: z.string().email(),
  clientPhone: z.string().max(50).optional(),
  petName: z.string().min(1).max(200),
  petSpecies: z.string().min(1).max(100),
  petBreed: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

bookRouter.post(
  "/appointments",
  zValidator("json", bookingSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const start = new Date(body.startTime);

    const [service] = await db
      .select()
      .from(services)
      .where(and(eq(services.id, body.serviceId), eq(services.active, true)));
    if (!service) return c.json({ error: "Service not found" }, 404);

    const end = new Date(start.getTime() + service.durationMinutes * 60_000);

    // Find all active groomers
    const groomers = await db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.active, true), eq(staff.role, "groomer")));

    if (groomers.length === 0) {
      return c.json({ error: "No groomers available" }, 409);
    }

    // Find conflicting appointments for this time window
    const booked = await db
      .select({ staffId: appointments.staffId })
      .from(appointments)
      .where(
        and(
          lt(appointments.startTime, end),
          gt(appointments.endTime, start),
          ne(appointments.status, "cancelled"),
          ne(appointments.status, "no_show"),
        )
      );

    const busyIds = new Set(booked.map((a) => a.staffId));
    const freeGroomer = groomers.find(({ id }) => !busyIds.has(id));
    if (!freeGroomer) {
      return c.json(
        { error: "No groomers available at this time. Please choose another slot." },
        409
      );
    }

    // Find or create client by email (skip disabled clients)
    let [client] = await db
      .select()
      .from(clients)
      .where(and(eq(clients.email, body.clientEmail), eq(clients.status, "active")));

    if (!client) {
      const inserted = await db
        .insert(clients)
        .values({
          name: body.clientName,
          email: body.clientEmail,
          phone: body.clientPhone ?? null,
        })
        .returning();
      client = inserted[0];
    }

    if (!client) return c.json({ error: "Failed to create client" }, 500);

    // Create pet
    const petInserted = await db
      .insert(pets)
      .values({
        clientId: client.id,
        name: body.petName,
        species: body.petSpecies,
        breed: body.petBreed ?? null,
      })
      .returning();
    const pet = petInserted[0];
    if (!pet) return c.json({ error: "Failed to create pet" }, 500);

    // Insert appointment in a transaction to guard against race conditions
    let appointment;
    try {
      appointment = await db.transaction(async (tx) => {
        const conflicts = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.staffId, freeGroomer.id),
              lt(appointments.startTime, end),
              gt(appointments.endTime, start),
              ne(appointments.status, "cancelled"),
              ne(appointments.status, "no_show"),
            )
          )
          .limit(1);

        if (conflicts.length > 0) {
          throw Object.assign(new Error("conflict"), { statusCode: 409 });
        }

        const apptInserted = await tx
          .insert(appointments)
          .values({
            clientId: client.id,
            petId: pet.id,
            serviceId: body.serviceId,
            staffId: freeGroomer.id,
            startTime: start,
            endTime: end,
            notes: body.notes ?? null,
          })
          .returning();
        return apptInserted[0];
      });
    } catch (err: unknown) {
      const code = (err as Error & { statusCode?: number }).statusCode;
      if (code === 409) {
        return c.json(
          { error: "This slot was just taken. Please choose another time." },
          409
        );
      }
      throw err;
    }

    if (!appointment) return c.json({ error: "Failed to create appointment" }, 500);

    return c.json({ appointment, client, pet }, 201);
  }
);

// ─── GET /api/book/confirm/:token ──────────────────────────────────────────
// Public: confirm appointment via tokenized email link. Redirects to success/error page.

const BASE_URL = () => process.env.APP_URL ?? "http://localhost:5173";

bookRouter.get("/confirm/:token", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.confirmationToken, token))
    .limit(1);

  if (!appt) {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  // Reject if appointment is in the past
  if (appt.startTime < new Date()) {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  // Idempotent confirm: if already confirmed, redirect to success
  if (appt.confirmationStatus === "confirmed") {
    return c.redirect(`${BASE_URL()}/booking/confirmed`);
  }

  // Reject if already cancelled
  if (appt.confirmationStatus === "cancelled") {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  await db
    .update(appointments)
    .set({
      confirmationStatus: "confirmed",
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appt.id));

  return c.redirect(`${BASE_URL()}/booking/confirmed`);
});

// ─── GET /api/book/cancel/:token ───────────────────────────────────────────
// Public: cancel appointment via tokenized email link. Redirects to success/error page.

bookRouter.get("/cancel/:token", async (c) => {
  const token = c.req.param("token");
  const db = getDb();

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.confirmationToken, token))
    .limit(1);

  if (!appt) {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  // Reject if appointment is in the past
  if (appt.startTime < new Date()) {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  // Reject if already cancelled (token was nullified — this path won't normally hit,
  // but guard against edge cases where token lookup still works)
  if (appt.confirmationStatus === "cancelled") {
    return c.redirect(`${BASE_URL()}/booking/error`);
  }

  // Single-use cancellation: nullify token after use
  await db
    .update(appointments)
    .set({
      confirmationStatus: "cancelled",
      cancelledAt: new Date(),
      confirmationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, appt.id));

  return c.redirect(`${BASE_URL()}/booking/cancelled`);
});
