import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray, getDb, clients, appointments } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const clientsRouter = new Hono<AppEnv>();

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});


// List clients — defaults to active only, ?includeDisabled=true shows all
// Groomers see only clients with at least one appointment assigned to them
clientsRouter.get("/", async (c) => {
  const db = getDb();
  const currentStaff = c.get("staff");
  const includeDisabled = c.req.query("includeDisabled") === "true";

  // Row-level scoping: groomers see only clients with ≥1 appointment for them
  if (currentStaff.role === "groomer") {
    const groomerAppointments = await db
      .select({ clientId: appointments.clientId })
      .from(appointments)
      .where(eq(appointments.staffId, currentStaff.id));

    const clientIds = [...new Set(groomerAppointments.map((a) => a.clientId))];
    if (clientIds.length === 0) return c.json([]);

    const conditions = [inArray(clients.id, clientIds)];
    if (!includeDisabled) conditions.push(eq(clients.status, "active"));

    const rows = await db
      .select()
      .from(clients)
      .where(and(...conditions))
      .orderBy(clients.name);
    return c.json(rows);
  }

  const query = includeDisabled
    ? db.select().from(clients).orderBy(clients.name)
    : db.select().from(clients).where(eq(clients.status, "active")).orderBy(clients.name);
  const rows = await query;
  return c.json(rows);
});

// Get a single client — groomers get 403 if no appointment links them to this client
clientsRouter.get("/:id", async (c) => {
  const db = getDb();
  const currentStaff = c.get("staff");
  const clientId = c.req.param("id");

  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId));
  if (!row) return c.json({ error: "Not found" }, 404);

  // Row-level scoping: groomers can only see clients linked via an appointment
  if (currentStaff.role === "groomer") {
    const linked = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clientId, clientId),
          eq(appointments.staffId, currentStaff.id)
        )
      )
      .limit(1);
    if (linked.length === 0) return c.json({ error: "Forbidden" }, 403);
  }

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
