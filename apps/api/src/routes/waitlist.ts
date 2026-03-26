import { Hono } from "hono";
import {
  and,
  eq,
  lt,
  getDb,
  waitlistEntries,
  clients,
  pets,
  services,
} from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const waitlistRouter = new Hono<AppEnv>();

async function markExpiredEntries(db: ReturnType<typeof getDb>, rows: { status: string; preferredDate: string }[]) {
  const today = new Date().toISOString().slice(0, 10);
  const hasExpired = rows.some((r) => r.status === "active" && r.preferredDate < today);
  if (hasExpired) {
    await db
      .update(waitlistEntries)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(waitlistEntries.status, "active"), lt(waitlistEntries.preferredDate, today)));
  }
}

waitlistRouter.get("/", async (c) => {
  const db = getDb();
  const date = c.req.query("date");

  const conditions = [];
  if (date) {
    conditions.push(eq(waitlistEntries.preferredDate, date));
  }

  const rows = await db
    .select({
      id: waitlistEntries.id,
      clientId: waitlistEntries.clientId,
      petId: waitlistEntries.petId,
      serviceId: waitlistEntries.serviceId,
      preferredDate: waitlistEntries.preferredDate,
      preferredTime: waitlistEntries.preferredTime,
      status: waitlistEntries.status,
      notifiedAt: waitlistEntries.notifiedAt,
      expiresAt: waitlistEntries.expiresAt,
      createdAt: waitlistEntries.createdAt,
      updatedAt: waitlistEntries.updatedAt,
      clientName: clients.name,
      clientEmail: clients.email,
      petName: pets.name,
      serviceName: services.name,
    })
    .from(waitlistEntries)
    .leftJoin(clients, eq(waitlistEntries.clientId, clients.id))
    .leftJoin(pets, eq(waitlistEntries.petId, pets.id))
    .leftJoin(services, eq(waitlistEntries.serviceId, services.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(waitlistEntries.createdAt);

  await markExpiredEntries(db, rows);

  const today = new Date().toISOString().slice(0, 10);
  const enriched = rows.map((row) => ({
    ...row,
    status: row.status === "active" && row.preferredDate < today ? "expired" : row.status,
  }));

  return c.json(enriched);
});

waitlistRouter.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  await markExpiredEntries(db, [row]);
  const today = new Date().toISOString().slice(0, 10);
  const isExpired = row.status === "active" && row.preferredDate < today;
  return c.json({
    ...row,
    status: isExpired ? "expired" : row.status,
  });
});
