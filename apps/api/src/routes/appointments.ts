import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, getDb, gte, lt, lte, ne, appointments } from "@groombook/db";

export const appointmentsRouter = new Hono();

const createAppointmentSchema = z.object({
  clientId: z.string().uuid(),
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  notes: z.string().max(2000).optional(),
  priceCents: z.number().int().positive().optional(),
});

const updateAppointmentSchema = z.object({
  staffId: z.string().uuid().nullable().optional(),
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
});

/** Returns true if a staff member has a non-cancelled appointment overlapping [start, end). */
async function hasConflict(
  staffId: string,
  start: Date,
  end: Date,
  excludeId?: string
): Promise<boolean> {
  const db = getDb();
  const conditions = [
    eq(appointments.staffId, staffId),
    // Overlap: existing.start < end AND existing.end > start
    lt(appointments.startTime, end),
    gte(appointments.endTime, start),
    // Ignore cancelled/no_show
    ne(appointments.status, "cancelled"),
    ne(appointments.status, "no_show"),
  ];
  if (excludeId) conditions.push(ne(appointments.id, excludeId));
  const rows = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

// List appointments, optionally filtered by date range or staffId
appointmentsRouter.get("/", async (c) => {
  const db = getDb();
  const from = c.req.query("from");
  const to = c.req.query("to");
  const staffId = c.req.query("staffId");

  const conditions = [];
  if (from) conditions.push(gte(appointments.startTime, new Date(from)));
  if (to) conditions.push(lte(appointments.startTime, new Date(to)));
  if (staffId) conditions.push(eq(appointments.staffId, staffId));

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
  const [row] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
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

    if (body.staffId) {
      const conflict = await hasConflict(body.staffId, start, end);
      if (conflict) {
        return c.json(
          { error: "Staff member has a conflicting appointment at this time" },
          409
        );
      }
    }

    const [row] = await db
      .insert(appointments)
      .values({ ...body, startTime: start, endTime: end })
      .returning();
    return c.json(row, 201);
  }
);

appointmentsRouter.patch(
  "/:id",
  zValidator("json", updateAppointmentSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    // If rescheduling, check for conflicts
    if ((body.startTime || body.endTime || body.staffId !== undefined) && body.staffId) {
      const existing = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, id))
        .limit(1);
      const current = existing[0];
      if (!current) return c.json({ error: "Not found" }, 404);

      const start = body.startTime ? new Date(body.startTime) : current.startTime;
      const end = body.endTime ? new Date(body.endTime) : current.endTime;
      const staffId = body.staffId ?? current.staffId;

      if (end <= start) {
        return c.json({ error: "endTime must be after startTime" }, 422);
      }

      if (staffId) {
        const conflict = await hasConflict(staffId, start, end, id);
        if (conflict) {
          return c.json(
            { error: "Staff member has a conflicting appointment at this time" },
            409
          );
        }
      }
    }

    const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.startTime) update.startTime = new Date(body.startTime);
    if (body.endTime) update.endTime = new Date(body.endTime);
    const [row] = await db
      .update(appointments)
      .set(update)
      .where(eq(appointments.id, id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

appointmentsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(appointments)
    .where(eq(appointments.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
