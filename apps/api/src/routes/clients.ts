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


// List clients — defaults to active only, ?includeDisabled=true shows all
clientsRouter.get("/", async (c) => {
  const db = getDb();
  const includeDisabled = c.req.query("includeDisabled") === "true";
  const query = includeDisabled
    ? db.select().from(clients).orderBy(clients.name)
    : db.select().from(clients).where(eq(clients.status, "active")).orderBy(clients.name);
  const rows = await query;
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

// Update a client (including status changes)
const patchClientSchema = createClientSchema.partial().extend({
  status: z.enum(["active", "disabled"]).optional(),
});

clientsRouter.patch(
  "/:id",
  zValidator("json", patchClientSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const now = new Date();

    const setValues: Record<string, unknown> = { ...body, updatedAt: now };

    // When disabling, set disabledAt; when re-enabling, clear it
    if (body.status === "disabled") {
      setValues.disabledAt = now;
    } else if (body.status === "active") {
      setValues.disabledAt = null;
    }

    const [row] = await db
      .update(clients)
      .set(setValues)
      .where(eq(clients.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

// Delete a client — requires ?confirm=true query param
clientsRouter.delete("/:id", async (c) => {
  const confirm = c.req.query("confirm");
  if (confirm !== "true") {
    return c.json(
      { error: "Permanent deletion requires ?confirm=true. Consider disabling the client instead." },
      400
    );
  }

  const db = getDb();
  const [row] = await db
    .delete(clients)
    .where(eq(clients.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
