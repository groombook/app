import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, getDb, pets } from "@groombook/db";

export const petsRouter = new Hono();

const createPetSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  species: z.string().min(1).max(100),
  breed: z.string().max(200).optional(),
  weightKg: z.number().positive().optional(),
  dateOfBirth: z.string().datetime().optional(),
  groomingNotes: z.string().max(2000).optional(),
});

const updatePetSchema = createPetSchema.partial().omit({ clientId: true });

petsRouter.get("/", async (c) => {
  const db = getDb();
  const clientId = c.req.query("clientId");
  const query = db.select().from(pets);
  if (clientId) {
    const rows = await query.where(eq(pets.clientId, clientId));
    return c.json(rows);
  }
  const rows = await query;
  return c.json(rows);
});

petsRouter.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(pets)
    .where(eq(pets.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

petsRouter.post("/", zValidator("json", createPetSchema), async (c) => {
  const db = getDb();
  const { weightKg, dateOfBirth, ...rest } = c.req.valid("json");
  const [row] = await db
    .insert(pets)
    .values({
      ...rest,
      weightKg: weightKg?.toString(),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
    })
    .returning();
  return c.json(row, 201);
});

petsRouter.patch(
  "/:id",
  zValidator("json", updatePetSchema),
  async (c) => {
    const db = getDb();
    const { weightKg, dateOfBirth, ...rest } = c.req.valid("json");
    const [row] = await db
      .update(pets)
      .set({
        ...rest,
        weightKg: weightKg?.toString(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(pets.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

petsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(pets)
    .where(eq(pets.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
