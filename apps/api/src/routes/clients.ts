import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, exists, getDb, or, clients, appointments } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const clientsRouter = new Hono<AppEnv>();

const createClientSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  smsOptIn: z.boolean().optional(),
  smsConsentText: z.string().max(1000).optional(),
});


// List clients — defaults to active only, ?includeDisabled=true shows all.
// Groomers see only clients with ≥1 appointment assigned to them.
clientsRouter.get("/", async (c) => {
  const db = getDb();
  const includeDisabled = c.req.query("includeDisabled") === "true";
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  // Groomer: subquery for clients with an appointment for this groomer
  const groomerApptFilter = isGroomer
    ? exists(
        db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.clientId, clients.id),
              or(
                eq(appointments.staffId, staffRow.id),
                eq(appointments.batherStaffId, staffRow.id)
              )
            )
          )
      )
    : undefined;

  const conditions = [];
  if (!includeDisabled) conditions.push(eq(clients.status, "active"));
  if (groomerApptFilter) conditions.push(groomerApptFilter);

  const rows = await db
    .select()
    .from(clients)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(clients.name);
  return c.json(rows);
});

// Get a single client
clientsRouter.get("/:id", async (c) => {
  const db = getDb();
  const clientId = c.req.param("id");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";
  const [row] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, clientId));
  if (!row) return c.json({ error: "Not found" }, 404);
  // Groomer: 403 if no appointment linkage to this client
  if (isGroomer) {
    const [linkage] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clientId, clientId),
          or(
            eq(appointments.staffId, staffRow.id),
            eq(appointments.batherStaffId, staffRow.id)
          )
        )
      )
      .limit(1);
    if (!linkage) return c.json({ error: "Forbidden" }, 403);
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
  smsOptOut: z.boolean().optional(),
});

clientsRouter.patch(
  "/:id",
  zValidator("json", patchClientSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const now = new Date();

    const setValues: Record<string, unknown> = { ...body, updatedAt: now };

    if (body.status === "disabled") {
      setValues.disabledAt = now;
    } else if (body.status === "active") {
      setValues.disabledAt = null;
    }

    if (body.smsOptOut === true) {
      setValues.smsOptIn = false;
      setValues.smsOptOutDate = now;
      delete setValues.smsOptOut;
    }
    delete setValues.smsOptOut;

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
  const clientId = c.req.param("id");

  const [existingAppt] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(eq(appointments.clientId, clientId))
    .limit(1);

  if (existingAppt) {
    return c.json(
      { error: "Cannot delete client with existing appointments. Cancel or reassign appointments first." },
      409
    );
  }

  const [row] = await db
    .delete(clients)
    .where(eq(clients.id, clientId))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
