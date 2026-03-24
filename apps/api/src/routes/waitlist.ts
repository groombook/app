import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  eq,
  getDb,
  waitlistEntries,
  clients,
  pets,
  services,
  impersonationSessions,
} from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const waitlistRouter = new Hono<AppEnv>();

const waitlistStatusEnum = z.enum(["active", "notified", "expired", "cancelled"]);

const createWaitlistEntrySchema = z.object({
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  preferredDate: z.string(),
  preferredTime: z.string(),
});

const updateWaitlistEntrySchema = z.object({
  status: waitlistStatusEnum.optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
});

waitlistRouter.get("/", async (c) => {
  const db = getDb();
  const date = c.req.query("date");

  const conditions = [];
  if (date) {
    conditions.push(eq(waitlistEntries.preferredDate, date));
  }

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(waitlistEntries)
          .where(and(...conditions))
          .orderBy(waitlistEntries.createdAt)
      : await db
          .select()
          .from(waitlistEntries)
          .orderBy(waitlistEntries.createdAt);

  const enriched = await Promise.all(
    rows.map(async (entry) => {
      const [client] = await db
        .select({ name: clients.name, email: clients.email })
        .from(clients)
        .where(eq(clients.id, entry.clientId))
        .limit(1);
      const [pet] = await db
        .select({ name: pets.name })
        .from(pets)
        .where(eq(pets.id, entry.petId))
        .limit(1);
      const [service] = await db
        .select({ name: services.name })
        .from(services)
        .where(eq(services.id, entry.serviceId))
        .limit(1);
      return {
        ...entry,
        clientName: client?.name ?? null,
        clientEmail: client?.email ?? null,
        petName: pet?.name ?? null,
        serviceName: service?.name ?? null,
      };
    })
  );

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
  return c.json(row);
});

waitlistRouter.post(
  "/",
  zValidator("json", createWaitlistEntrySchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const sessionId = c.req.header("X-Impersonation-Session-Id");

    let clientId: string | null = null;
    if (sessionId) {
      const [session] = await db
        .select()
        .from(impersonationSessions)
        .where(
          and(
            eq(impersonationSessions.id, sessionId),
            eq(impersonationSessions.status, "active")
          )
        )
        .limit(1);
      if (session && session.expiresAt > new Date()) {
        clientId = session.clientId;
      }
    }

    if (!clientId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const [entry] = await db
      .insert(waitlistEntries)
      .values({
        clientId,
        petId: body.petId,
        serviceId: body.serviceId,
        preferredDate: body.preferredDate,
        preferredTime: body.preferredTime,
      })
      .returning();

    return c.json(entry, 201);
  }
);

waitlistRouter.patch(
  "/:id",
  zValidator("json", updateWaitlistEntrySchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updateData.status = body.status;
    if (body.preferredDate !== undefined) updateData.preferredDate = body.preferredDate;
    if (body.preferredTime !== undefined) updateData.preferredTime = body.preferredTime;

    const [updated] = await db
      .update(waitlistEntries)
      .set(updateData)
      .where(eq(waitlistEntries.id, id))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  }
);

waitlistRouter.delete("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const sessionId = c.req.header("X-Impersonation-Session-Id");

  if (sessionId) {
    const [session] = await db
      .select()
      .from(impersonationSessions)
      .where(
        and(
          eq(impersonationSessions.id, sessionId),
          eq(impersonationSessions.status, "active")
        )
      )
      .limit(1);
    if (session && session.expiresAt > new Date()) {
      const [entry] = await db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.id, id))
        .limit(1);
      if (entry && entry.clientId !== session.clientId) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }
  }

  const [deleted] = await db
    .delete(waitlistEntries)
    .where(eq(waitlistEntries.id, id))
    .returning();

  if (!deleted) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
