import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  and,
  eq,
  desc,
  lt,
  sql,
  getDb,
  conversations,
  messages,
  clients,
  businessSettings,
  isNull,
} from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";
import { sendMessage } from "../services/messaging/outbound.js";

export const conversationsRouter = new Hono<AppEnv>();

const sendMessageSchema = z.object({
  body: z.string().min(1).max(1600),
});

// GET /api/conversations — List conversations
conversationsRouter.get("/", async (c) => {
  const db = getDb();
  const staffRow = c.get("staff");
  if (!staffRow) return c.json({ error: "Unauthorized" }, 401);

  const [settings] = await db
    .select({ id: businessSettings.id })
    .from(businessSettings)
    .limit(1);
  if (!settings) return c.json({ error: "Business not found" }, 404);

  const cursor = c.req.query("cursor") || undefined;
  const limit = Math.min(Number(c.req.query("limit") || "20"), 50);

  let baseQuery = db
    .select({
      id: conversations.id,
      clientId: conversations.clientId,
      lastMessageAt: conversations.lastMessageAt,
      status: conversations.status,
      staffReadAt: conversations.staffReadAt,
      clientName: clients.name,
      clientPhone: clients.phone,
      channel: conversations.channel,
    })
    .from(conversations)
    .innerJoin(clients, eq(conversations.clientId, clients.id))
    .where(eq(conversations.businessId, settings.id))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit + 1);

  if (cursor) {
    const [cursorRow] = await db
      .select({ lastMessageAt: conversations.lastMessageAt })
      .from(conversations)
      .where(eq(conversations.id, cursor))
      .limit(1);
    if (cursorRow?.lastMessageAt) {
      baseQuery = db
        .select({
          id: conversations.id,
          clientId: conversations.clientId,
          lastMessageAt: conversations.lastMessageAt,
          status: conversations.status,
          staffReadAt: conversations.staffReadAt,
          clientName: clients.name,
          clientPhone: clients.phone,
          channel: conversations.channel,
        })
        .from(conversations)
        .innerJoin(clients, eq(conversations.clientId, clients.id))
        .where(
          and(
            eq(conversations.businessId, settings.id),
            lt(conversations.lastMessageAt, cursorRow.lastMessageAt)
          )
        )
        .orderBy(desc(conversations.lastMessageAt))
        .limit(limit + 1);
    }
  }

  const rows = await baseQuery;

  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const items = await Promise.all(
    rows.map(async (row) => {
      const [unreadRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, row.id),
            eq(messages.direction, "inbound"),
            sql`${messages.createdAt} > COALESCE(${row.staffReadAt}, '1970-01-01'::timestamp)`
          )
        )
        .limit(1);

      const [lastMsg] = await db
        .select({
          body: messages.body,
          direction: messages.direction,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.conversationId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return {
        id: row.id,
        clientId: row.clientId,
        clientName: row.clientName,
        clientPhone: row.clientPhone,
        channel: row.channel,
        lastMessageAt: row.lastMessageAt,
        status: row.status,
        unreadCount: Number(unreadRow?.count ?? 0),
        lastMessage: lastMsg ?? null,
      };
    })
  );

  const lastRow = rows[rows.length - 1];
  const nextCursor = hasMore && lastRow ? lastRow.id : null;
  return c.json({ items, nextCursor });
});

// GET /api/conversations/:id/messages — List messages for a conversation
conversationsRouter.get("/:id/messages", async (c) => {
  const db = getDb();
  const staffRow = c.get("staff");
  if (!staffRow) return c.json({ error: "Unauthorized" }, 401);

  const conversationId = c.req.param("id");
  const cursor = c.req.query("cursor") || undefined;
  const limit = Math.min(Number(c.req.query("limit") || "50"), 100);

  const [settings] = await db
    .select({ id: businessSettings.id })
    .from(businessSettings)
    .limit(1);
  if (!settings) return c.json({ error: "Business not found" }, 404);

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.id, conversationId), eq(conversations.businessId, settings.id))
    )
    .limit(1);
  if (!conv) return c.json({ error: "Not found" }, 404);

  await db
    .update(conversations)
    .set({ staffReadAt: new Date() })
    .where(eq(conversations.id, conversationId));

  let query = db
    .select({
      id: messages.id,
      direction: messages.direction,
      body: messages.body,
      status: messages.status,
      sentByStaffId: messages.sentByStaffId,
      createdAt: messages.createdAt,
      deliveredAt: messages.deliveredAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit + 1);

  if (cursor) {
    const [cursorRow] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, cursor))
      .limit(1);
    if (cursorRow?.createdAt) {
      query = db
        .select({
          id: messages.id,
          direction: messages.direction,
          body: messages.body,
          status: messages.status,
          sentByStaffId: messages.sentByStaffId,
          createdAt: messages.createdAt,
          deliveredAt: messages.deliveredAt,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            lt(messages.createdAt, cursorRow.createdAt)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(limit + 1);
    }
  }

  const rows = await query;
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  const lastRow = rows[rows.length - 1];
  const nextCursor = hasMore && lastRow ? lastRow.id : null;
  return c.json({ items: rows, nextCursor });
});

// POST /api/conversations/:id/messages — Send a message
conversationsRouter.post(
  "/:id/messages",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const db = getDb();
    const staffRow = c.get("staff");
    if (!staffRow) return c.json({ error: "Unauthorized" }, 401);

    const conversationId = c.req.param("id");
    const { body } = c.req.valid("json");

    const [settings] = await db
      .select({ id: businessSettings.id })
      .from(businessSettings)
      .limit(1);
    if (!settings) return c.json({ error: "Business not found" }, 404);

    const [conv] = await db
      .select({ id: conversations.id, clientId: conversations.clientId })
      .from(conversations)
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.businessId, settings.id))
      )
      .limit(1);
    if (!conv) return c.json({ error: "Not found" }, 404);

    const result = await sendMessage({
      businessId: settings.id,
      clientId: conv.clientId,
      body,
      sentByStaffId: staffRow.id,
    });

    if (result.suppressed) {
      return c.json({ error: "Client has opted out of SMS" }, 409);
    }

    const [msg] = await db
      .select({
        id: messages.id,
        direction: messages.direction,
        body: messages.body,
        status: messages.status,
        sentByStaffId: messages.sentByStaffId,
        createdAt: messages.createdAt,
        deliveredAt: messages.deliveredAt,
      })
      .from(messages)
      .where(eq(messages.id, result.messageId))
      .limit(1);

    return c.json(msg, 201);
  }
);