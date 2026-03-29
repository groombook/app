import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, services } from "@groombook/db";

export const servicesRouter = new Hono();

const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  basePriceCents: z.number().int().positive(),
  durationMinutes: z.number().int().positive(),
  active: z.boolean().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

servicesRouter.get("/", async (c) => {
  const db = getDb();
  const includeInactive = c.req.query("includeInactive") === "true";
  const query = db.select().from(services).orderBy(services.name);
  const rows = includeInactive
    ? await query
    : await query.where(eq(services.active, true));
  return c.json(rows);
});

servicesRouter.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(services)
    .where(eq(services.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

servicesRouter.post(
  "/",
  zValidator("json", createServiceSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const [row] = await db.insert(services).values(body).returning();
    return c.json(row, 201);
  }
);

servicesRouter.patch(
  "/:id",
  zValidator("json", updateServiceSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const [row] = await db
      .update(services)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(services.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

servicesRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(services)
    .where(eq(services.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
