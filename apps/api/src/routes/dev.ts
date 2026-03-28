import { Hono } from "hono";
import { getDb, staff, clients, eq, sql } from "@groombook/db";

const devRouter = new Hono();

// GET /api/dev/config — tells the frontend whether auth is disabled
devRouter.get("/config", (c) => {
  return c.json({ authDisabled: process.env.AUTH_DISABLED === "true" });
});

// GET /api/dev/users — list staff and clients for the login selector
// Only available when AUTH_DISABLED=true
devRouter.get("/users", async (c) => {
  if (process.env.AUTH_DISABLED !== "true") {
    return c.json({ error: "Not available when auth is enabled" }, 403);
  }

  const db = getDb();

  const staffList = await db
    .select({
      id: staff.id,
      userId: staff.userId,
      name: staff.name,
      email: staff.email,
      role: staff.role,
    })
    .from(staff)
    .where(eq(staff.active, true))
    .orderBy(staff.name);

  const clientList = await db
    .select({
      id: clients.id,
      name: clients.name,
      email: clients.email,
      petCount: sql<number>`(SELECT count(*) FROM pets WHERE pets.client_id = ${clients.id})`.as("pet_count"),
    })
    .from(clients)
    .orderBy(clients.name)
    .limit(20);

  return c.json({ staff: staffList, clients: clientList });
});

export { devRouter };
