import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, desc, eq, getDb, groomingVisitLogs, appointments, or } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const groomingLogsRouter = new Hono<AppEnv>();

const createLogSchema = z.object({
  petId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  cutStyle: z.string().max(500).optional(),
  productsUsed: z.string().max(1000).optional(),
  notes: z.string().max(2000).optional(),
  groomedAt: z.string().datetime().optional(),
});

// GET /api/grooming-logs?petId=<uuid>
groomingLogsRouter.get("/", async (c) => {
  const db = getDb();
  const petId = c.req.query("petId");
  if (!petId) return c.json({ error: "petId is required" }, 400);
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  if (isGroomer) {
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.petId, petId),
          or(
            eq(appointments.staffId, staffRow.id),
            eq(appointments.batherStaffId, staffRow.id)
          )
        )
      )
      .limit(1);
    if (!appt) return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db
    .select()
    .from(groomingVisitLogs)
    .where(eq(groomingVisitLogs.petId, petId))
    .orderBy(desc(groomingVisitLogs.groomedAt));
  return c.json(rows);
});

groomingLogsRouter.post(
  "/",
  zValidator("json", createLogSchema),
  async (c) => {
    const db = getDb();
    const { groomedAt, petId, appointmentId, ...rest } = c.req.valid("json");
    const staffRow = c.get("staff");
    const isGroomer = staffRow?.role === "groomer";

    if (isGroomer) {
      if (appointmentId) {
        const [appt] = await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.id, appointmentId),
              or(
                eq(appointments.staffId, staffRow.id),
                eq(appointments.batherStaffId, staffRow.id)
              )
            )
          )
          .limit(1);
        if (!appt) return c.json({ error: "Forbidden" }, 403);
      } else {
        const [appt] = await db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.petId, petId),
              or(
                eq(appointments.staffId, staffRow.id),
                eq(appointments.batherStaffId, staffRow.id)
              )
            )
          )
          .limit(1);
        if (!appt) return c.json({ error: "Forbidden" }, 403);
      }
    }

    const [row] = await db
      .insert(groomingVisitLogs)
      .values({
        ...rest,
        petId,
        appointmentId: appointmentId ?? null,
        groomedAt: groomedAt ? new Date(groomedAt) : new Date(),
      })
      .returning();
    return c.json(row, 201);
  }
);

groomingLogsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  const [log] = await db
    .select()
    .from(groomingVisitLogs)
    .where(eq(groomingVisitLogs.id, id))
    .limit(1);
  if (!log) return c.json({ error: "Not found" }, 404);

  if (isGroomer) {
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.petId, log.petId),
          or(
            eq(appointments.staffId, staffRow.id),
            eq(appointments.batherStaffId, staffRow.id)
          )
        )
      )
      .limit(1);
    if (!appt) return c.json({ error: "Forbidden" }, 403);
  }

  await db
    .delete(groomingVisitLogs)
    .where(eq(groomingVisitLogs.id, id))
    .returning();
  return c.json({ ok: true });
});
