import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, getDb, clients } from "@groombook/db";

export const clientsRouter = new Hono();

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

const updateClientSchema = createClientSchema.partial();

// List all clients
clientsRouter.get("/", async (c) => {
  const db = getDb();
  const rows = await db.select().from(clients).orderBy(clients.name);
  return c.json(rows);
});

// Get a single client
clientsRouter.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

// Create a client
clientsRouter.post("/", zValidator("json", createClientSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const [row] = await db.insert(clients).values(body).returning();
  return c.json(row, 201);
});

// Update a client
clientsRouter.patch(
  "/:id",
  zValidator("json", updateClientSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const [row] = await db
      .update(clients)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(clients.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

// Delete a client
clientsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(clients)
    .where(eq(clients.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
