import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { desc, eq, getDb, groomingVisitLogs } from "@groombook/db";

export const groomingLogsRouter = new Hono();

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
    const { groomedAt, ...rest } = c.req.valid("json");
    const [row] = await db
      .insert(groomingVisitLogs)
      .values({
        ...rest,
        groomedAt: groomedAt ? new Date(groomedAt) : new Date(),
      })
      .returning();
    return c.json(row, 201);
  }
);

groomingLogsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(groomingVisitLogs)
    .where(eq(groomingVisitLogs.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
