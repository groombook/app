import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, gte, lte } from "drizzle-orm";
import { getDb, appointments } from "@groombook/db";

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

// List appointments, optionally filtered by date range
appointmentsRouter.get("/", async (c) => {
  const db = getDb();
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [];
  if (from) conditions.push(gte(appointments.startTime, new Date(from)));
  if (to) conditions.push(lte(appointments.startTime, new Date(to)));

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
    const [row] = await db
      .insert(appointments)
      .values({
        ...body,
        startTime: new Date(body.startTime),
        endTime: new Date(body.endTime),
      })
      .returning();
    return c.json(row, 201);
  }
);

appointmentsRouter.patch(
  "/:id",
  zValidator("json", updateAppointmentSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
    if (body.startTime) update.startTime = new Date(body.startTime);
    if (body.endTime) update.endTime = new Date(body.endTime);
    const [row] = await db
      .update(appointments)
      .set(update)
      .where(eq(appointments.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);
