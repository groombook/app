import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { randomBytes } from "node:crypto";
import {
  and,
  eq,
  getDb,
  gte,
  lt,
  lte,
  ne,
  or,
  appointments,
  clients,
  pets,
  recurringSeries,
  reminderLogs,
  services,
  staff,
} from "@groombook/db";
import { buildConfirmationEmail, sendEmail } from "../services/email.js";
import { notifyWaitlistForAppointment } from "../services/waitlistNotify.js";
import type { AppEnv } from "../middleware/rbac.js";

export const appointmentsRouter = new Hono<AppEnv>();

const createAppointmentSchema = z.object({
  clientId: z.string().uuid(),
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  batherStaffId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  priceCents: z.number().int().positive().optional(),
  // Optional recurrence: creates a series of N appointments every frequencyWeeks weeks
  recurrence: z
    .object({
      frequencyWeeks: z.number().int().min(1).max(52),
      count: z.number().int().min(2).max(52),
    })
    .refine(
      (r) => r.frequencyWeeks * r.count <= 52,
      { message: "Recurrence series must not exceed 1 year" }
    )
    .optional(),
});

const updateAppointmentSchema = z.object({
  staffId: z.string().uuid().nullable().optional(),
  batherStaffId: z.string().uuid().nullable().optional(),
  status: z
    .enum([
      "scheduled",
      "confirmed",
      "in_progress",
      "completed",
      "cancelled",
      "no_show",
    ])
    .optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  notes: z.string().max(2000).nullable().optional(),
  priceCents: z.number().int().positive().nullable().optional(),
  // When updating a series member, optionally propagate the change
  cascadeMode: z.enum(["this_only", "this_and_future", "all"]).optional(),
});

// List appointments, optionally filtered by date range or staffId.
// Groomers see only their own appointments (staffId or batherStaffId).
appointmentsRouter.get("/", async (c) => {
  const db = getDb();
  const from = c.req.query("from");
  const to = c.req.query("to");
  const staffId = c.req.query("staffId");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  const conditions = [];
  if (from) conditions.push(gte(appointments.startTime, new Date(from)));
  if (to) conditions.push(lte(appointments.startTime, new Date(to)));
  if (staffId) conditions.push(eq(appointments.staffId, staffId));

  // Groomer: restrict to their own appointments (as groomer or bather)
  if (isGroomer) {
    conditions.push(
      or(
        eq(appointments.staffId, staffRow.id),
        eq(appointments.batherStaffId, staffRow.id)
      )
    );
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(appointments)
          .where(and(...conditions))
          .orderBy(appointments.startTime)
      : await db
          .select()
          .from(appointments)
          .orderBy(appointments.startTime);

  return c.json(rows);
});

appointmentsRouter.get("/:id", async (c) => {
  const db = getDb();
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  // Groomer: 403 if not assigned as groomer or bather
  if (isGroomer && row.staffId !== staffRow.id && row.batherStaffId !== staffRow.id) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return c.json(row);
});

appointmentsRouter.post(
  "/",
  zValidator("json", createAppointmentSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const start = new Date(body.startTime);
    const end = new Date(body.endTime);

    if (end <= start) {
      return c.json({ error: "endTime must be after startTime" }, 422);
    }

    const { recurrence, ...apptFields } = body;

    // Wrap conflict check + insert in a transaction to prevent double-booking
    // race conditions under concurrent load (fixes #18).
    let firstRow: typeof appointments.$inferSelect;
    try {
      firstRow = await db.transaction(async (tx) => {
        // Conflict check applies to the first occurrence only; subsequent
        // occurrences are spread weeks apart so conflicts are unlikely and can
        // be resolved individually if needed.
        if (apptFields.staffId) {
          const conflicts = await tx
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                eq(appointments.staffId, apptFields.staffId),
                lt(appointments.startTime, end),
                gte(appointments.endTime, start),
                ne(appointments.status, "cancelled"),
                ne(appointments.status, "no_show"),
              )
            )
            .limit(1);
          if (conflicts.length > 0) {
            throw Object.assign(new Error("conflict"), { statusCode: 409 });
          }
        }

        if (apptFields.batherStaffId) {
          const bathConflicts = await tx
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                or(
                  eq(appointments.staffId, apptFields.batherStaffId),
                  eq(appointments.batherStaffId, apptFields.batherStaffId)
                ),
                lt(appointments.startTime, end),
                gte(appointments.endTime, start),
                ne(appointments.status, "cancelled"),
                ne(appointments.status, "no_show"),
              )
            )
            .limit(1);
          if (bathConflicts.length > 0) {
            throw Object.assign(new Error("conflict"), { statusCode: 409 });
          }
        }

        if (!recurrence) {
          // Single appointment
          const [inserted] = await tx
            .insert(appointments)
            .values({ ...apptFields, startTime: start, endTime: end })
            .returning();
          if (!inserted) throw new Error("Insert failed");
          return inserted;
        }

        // Create recurring series
        const seriesRows = await tx
          .insert(recurringSeries)
          .values({ frequencyWeeks: recurrence.frequencyWeeks })
          .returning();
        const series = seriesRows[0];
        if (!series) throw new Error("Failed to create recurring series");

        const durationMs = end.getTime() - start.getTime();
        const intervalMs =
          recurrence.frequencyWeeks * 7 * 24 * 60 * 60 * 1000;

        let first: typeof appointments.$inferSelect | undefined;
        for (let i = 0; i < recurrence.count; i++) {
          const instanceStart = new Date(start.getTime() + i * intervalMs);
          const instanceEnd = new Date(
            instanceStart.getTime() + durationMs
          );
          const [inserted] = await tx
            .insert(appointments)
            .values({
              ...apptFields,
              startTime: instanceStart,
              endTime: instanceEnd,
              seriesId: series.id,
              seriesIndex: i,
            })
            .returning();
          if (i === 0) first = inserted;
        }

        if (!first) throw new Error("No appointments created");
        return first;
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        (err as Error & { statusCode?: number }).statusCode === 409
      ) {
        return c.json(
          { error: "Staff member has a conflicting appointment at this time" },
          409
        );
      }
      throw err;
    }

    // Send confirmation email (fire-and-forget — never fails the request)
    sendConfirmationEmail(db, firstRow).catch((err) => {
      console.error("[appointments] Failed to send confirmation email:", err);
    });

    return c.json(firstRow, 201);
  }
);

// ─── Confirmation email helper ─────────────────────────────────────────────

async function sendConfirmationEmail(
  db: ReturnType<typeof getDb>,
  appt: typeof appointments.$inferSelect
): Promise<void> {
  const [client] = await db
    .select({ name: clients.name, email: clients.email, emailOptOut: clients.emailOptOut })
    .from(clients)
    .where(eq(clients.id, appt.clientId))
    .limit(1);

  if (!client || !client.email || client.emailOptOut) return;

  const [pet] = await db
    .select({ name: pets.name })
    .from(pets)
    .where(eq(pets.id, appt.petId))
    .limit(1);

  const [service] = await db
    .select({ name: services.name })
    .from(services)
    .where(eq(services.id, appt.serviceId))
    .limit(1);

  let groomerName: string | null = null;
  if (appt.staffId) {
    const [groomer] = await db
      .select({ name: staff.name })
      .from(staff)
      .where(eq(staff.id, appt.staffId))
      .limit(1);
    groomerName = groomer?.name ?? null;
  }

  if (!pet || !service) return;

  const sent = await sendEmail(
    buildConfirmationEmail(client.email, {
      clientName: client.name,
      petName: pet.name,
      serviceName: service.name,
      groomerName,
      startTime: appt.startTime,
    })
  );

  if (sent) {
    await db
      .insert(reminderLogs)
      .values({ appointmentId: appt.id, reminderType: "confirmation" })
      .onConflictDoNothing();
  }
}

appointmentsRouter.patch(
  "/:id",
  zValidator("json", updateAppointmentSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const { cascadeMode = "this_only", ...updateFields } = body;

    // ── Cascade update (this_and_future / all) ────────────────────────────────
    if (cascadeMode !== "this_only") {
      let row: typeof appointments.$inferSelect | undefined;
      try {
        row = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(appointments)
            .where(eq(appointments.id, id))
            .limit(1);
          if (!current) {
            throw Object.assign(new Error("not found"), { statusCode: 404 });
          }

          // Compute time deltas and apply them uniformly across the series so
          // all instances shift by the same amount (e.g. rescheduled 1 hr later).
          const startDeltaMs = updateFields.startTime
            ? new Date(updateFields.startTime).getTime() -
              current.startTime.getTime()
            : 0;
          const endDeltaMs = updateFields.endTime
            ? new Date(updateFields.endTime).getTime() -
              current.endTime.getTime()
            : 0;

          // Validate resulting times on the anchor appointment
          const newStart = new Date(
            current.startTime.getTime() + startDeltaMs
          );
          const newEnd = new Date(current.endTime.getTime() + endDeltaMs);
          if (newEnd <= newStart) {
            throw Object.assign(new Error("end before start"), {
              statusCode: 422,
            });
          }

          // Determine which appointments to update
          let whereClause;
          if (current.seriesId && current.seriesIndex !== null) {
            whereClause =
              cascadeMode === "this_and_future"
                ? and(
                    eq(appointments.seriesId, current.seriesId),
                    gte(appointments.seriesIndex, current.seriesIndex),
                  )
                : eq(appointments.seriesId, current.seriesId);
          } else {
            // Not part of a series — fall back to single update
            whereClause = eq(appointments.id, id);
          }

          const affected = await tx
            .select()
            .from(appointments)
            .where(whereClause);

          let firstUpdated: typeof appointments.$inferSelect | undefined;
          for (const appt of affected) {
            const apptUpdate: Record<string, unknown> = {
              updatedAt: new Date(),
            };
            if (updateFields.staffId !== undefined)
              apptUpdate.staffId = updateFields.staffId;
            if (updateFields.notes !== undefined)
              apptUpdate.notes = updateFields.notes;
            if (updateFields.status !== undefined)
              apptUpdate.status = updateFields.status;
            if (updateFields.priceCents !== undefined)
              apptUpdate.priceCents = updateFields.priceCents;
            if (startDeltaMs !== 0)
              apptUpdate.startTime = new Date(
                appt.startTime.getTime() + startDeltaMs
              );
            if (endDeltaMs !== 0)
              apptUpdate.endTime = new Date(
                appt.endTime.getTime() + endDeltaMs
              );

            const [updated] = await tx
              .update(appointments)
              .set(apptUpdate)
              .where(eq(appointments.id, appt.id))
              .returning();
            if (appt.id === id) firstUpdated = updated;
          }

          return firstUpdated;
        });
      } catch (err: unknown) {
        const statusCode = (err as Error & { statusCode?: number }).statusCode;
        if (statusCode === 404) return c.json({ error: "Not found" }, 404);
        if (statusCode === 422)
          return c.json({ error: "endTime must be after startTime" }, 422);
        throw err;
      }

      if (!row) return c.json({ error: "Not found" }, 404);
      return c.json(row);
    }

    // ── this_only (original logic) ────────────────────────────────────────────
    const needsConflictCheck =
      updateFields.startTime !== undefined ||
      updateFields.endTime !== undefined ||
      updateFields.staffId !== undefined ||
      updateFields.batherStaffId !== undefined;

    const update: Record<string, unknown> = {
      ...updateFields,
      updatedAt: new Date(),
    };
    if (updateFields.startTime) update.startTime = new Date(updateFields.startTime);
    if (updateFields.endTime) update.endTime = new Date(updateFields.endTime);

    if (needsConflictCheck) {
      // Wrap conflict check + update in a transaction to prevent race conditions
      // (fixes #18). Also falls back to the existing staffId when staffId is
      // omitted from the request, so rescheduling always checks conflicts (fixes #19).
      let row: typeof appointments.$inferSelect | undefined;
      try {
        row = await db.transaction(async (tx) => {
          const [current] = await tx
            .select()
            .from(appointments)
            .where(eq(appointments.id, id))
            .limit(1);
          if (!current) {
            throw Object.assign(new Error("not found"), { statusCode: 404 });
          }

          const start = updateFields.startTime
            ? new Date(updateFields.startTime)
            : current.startTime;
          const end = updateFields.endTime
            ? new Date(updateFields.endTime)
            : current.endTime;
          // Use provided staffId (may be null to unassign); fall back to existing
          const staffId =
            updateFields.staffId !== undefined
              ? updateFields.staffId
              : current.staffId;
          // Use provided batherStaffId (may be null to unassign); fall back to existing
          const batherStaffId =
            updateFields.batherStaffId !== undefined
              ? updateFields.batherStaffId
              : current.batherStaffId;

          if (end <= start) {
            throw Object.assign(new Error("end before start"), {
              statusCode: 422,
            });
          }

          if (staffId) {
            const conflicts = await tx
              .select({ id: appointments.id })
              .from(appointments)
              .where(
                and(
                  eq(appointments.staffId, staffId),
                  lt(appointments.startTime, end),
                  gte(appointments.endTime, start),
                  ne(appointments.status, "cancelled"),
                  ne(appointments.status, "no_show"),
                  ne(appointments.id, id),
                )
              )
              .limit(1);
            if (conflicts.length > 0) {
              throw Object.assign(new Error("conflict"), { statusCode: 409 });
            }
          }

          if (batherStaffId) {
            const bathConflicts = await tx
              .select({ id: appointments.id })
              .from(appointments)
              .where(
                and(
                  or(
                    eq(appointments.staffId, batherStaffId),
                    eq(appointments.batherStaffId, batherStaffId)
                  ),
                  lt(appointments.startTime, end),
                  gte(appointments.endTime, start),
                  ne(appointments.status, "cancelled"),
                  ne(appointments.status, "no_show"),
                  ne(appointments.id, id),
                )
              )
              .limit(1);
            if (bathConflicts.length > 0) {
              throw Object.assign(new Error("conflict"), { statusCode: 409 });
            }
          }

          const [updated] = await tx
            .update(appointments)
            .set(update)
            .where(eq(appointments.id, id))
            .returning();
          return updated;
        });
      } catch (err: unknown) {
        const statusCode = (err as Error & { statusCode?: number }).statusCode;
        if (statusCode === 404) return c.json({ error: "Not found" }, 404);
        if (statusCode === 422)
          return c.json({ error: "endTime must be after startTime" }, 422);
        if (statusCode === 409)
          return c.json(
            {
              error: "Staff member has a conflicting appointment at this time",
            },
            409
          );
        throw err;
      }

      if (!row) return c.json({ error: "Not found" }, 404);
      return c.json(row);
    }

    const [row] = await db
      .update(appointments)
      .set(update)
      .where(eq(appointments.id, id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

// Soft-delete: cancel the appointment instead of removing the row,
// preserving audit trail and financial records (fixes #20).
// Optional ?cascade=this_only|this_and_future|all for series appointments.
appointmentsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const cascade = c.req.query("cascade") ?? "this_only";

  if (cascade === "this_and_future" || cascade === "all") {
    const [current] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);
    if (!current) return c.json({ error: "Not found" }, 404);

    if (current.seriesId && current.seriesIndex !== null) {
      const whereClause =
        cascade === "this_and_future"
          ? and(
              eq(appointments.seriesId, current.seriesId),
              gte(appointments.seriesIndex, current.seriesIndex),
            )
          : eq(appointments.seriesId, current.seriesId);
      await db
        .update(appointments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(whereClause);
    } else {
      // Not in a series — cancel only this one
      await db
        .update(appointments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(appointments.id, id));
    }

    const apptDate = current.startTime.toISOString().slice(0, 10);
    const apptTime = current.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    notifyWaitlistForAppointment(id, apptDate, apptTime, current.serviceId).catch((err) => {
      console.error("[appointments] Failed to notify waitlist:", err);
    });

    return c.json({ ok: true });
  }

  // Single cancel (default)
  const [current] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);
  if (!current) return c.json({ error: "Not found" }, 404);

  const apptDate = current.startTime.toISOString().slice(0, 10);
  const apptTime = current.startTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });

  const [row] = await db
    .update(appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(appointments.id, id))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);

  notifyWaitlistForAppointment(id, apptDate, apptTime, current.serviceId).catch((err) => {
    console.error("[appointments] Failed to notify waitlist:", err);
  });

  return c.json({ ok: true });
});

// ─── POST /api/appointments/:id/confirm ───────────────────────────────────────
// Staff/portal: confirm a specific appointment by ID. Idempotent.

appointmentsRouter.post("/:id/confirm", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);

  if (!appt) return c.json({ error: "Not found" }, 404);

  if (appt.confirmationStatus === "cancelled") {
    return c.json({ error: "Cannot confirm a cancelled appointment" }, 409);
  }

  if (appt.confirmationStatus === "confirmed") {
    return c.json(appt); // idempotent
  }

  const [updated] = await db
    .update(appointments)
    .set({ confirmationStatus: "confirmed", confirmedAt: new Date(), updatedAt: new Date() })
    .where(eq(appointments.id, id))
    .returning();

  return c.json(updated);
});

// ─── POST /api/appointments/:id/cancel ───────────────────────────────────────
// Staff/portal: cancel confirmation for a specific appointment by ID. Single-use token nullified.

appointmentsRouter.post("/:id/cancel", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, id))
    .limit(1);

  if (!appt) return c.json({ error: "Not found" }, 404);

  if (appt.confirmationStatus === "cancelled") {
    return c.json({ error: "Appointment is already cancelled" }, 409);
  }

  const [updated] = await db
    .update(appointments)
    .set({
      confirmationStatus: "cancelled",
      cancelledAt: new Date(),
      confirmationToken: null,
      updatedAt: new Date(),
    })
    .where(eq(appointments.id, id))
    .returning();

  return c.json(updated);
});

// ─── Token generation helper ──────────────────────────────────────────────────

export function generateConfirmationToken(): string {
  return randomBytes(32).toString("hex");
}
