import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, desc, lt, isNull, sql, count } from "@groombook/db";
import { getDb, conversations, messages, clients } from "@groombook/db";
import { resolveStaffMiddleware } from "../middleware/rbac.js";
import type { AppEnv } from "../middleware/rbac.js";

export const conversationsRouter = new Hono<AppEnv>();

conversationsRouter.use("/*", resolveStaffMiddleware);

// GET /api/conversations — list all conversations for staff's business
conversationsRouter.get("/", async (c) => {
  const db = getDb();
  const businessId = c.get("staff").businessId;

  const rows = await db
    .select({
      id: conversations.id,
      businessId: conversations.businessId,
      clientId: conversations.clientId,
      channel: conversations.channel,
      externalNumber: conversations.externalNumber,
      businessNumber: conversations.businessNumber,
      lastMessageAt: conversations.lastMessageAt,
      status: conversations.status,
      createdAt: conversations.createdAt,
      staffReadAt: conversations.staffReadAt,
    })
    .from(conversations)
    .where(eq(conversations.businessId, businessId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(20);

  // For each conversation, fetch client name and count unread messages
  const enriched = await Promise.all(
    rows.map(async (row) => {
      const [client] = await db
        .select({ name: clients.name })
        .from(clients)
        .where(eq(clients.id, row.clientId))
        .limit(1);

      // Count messages where direction = 'inbound' AND readByClientAt IS NULL
      const [{ count: unreadCount }] = await db
        .select({ count: count() })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, row.id),
            eq(messages.direction, "inbound"),
            isNull(messages.readByClientAt)
          )
        );

      // Fetch last message body for preview
      const [lastMsg] = await db
        .select({ body: messages.body, createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, row.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return {
        ...row,
        clientName: client?.name ?? "Unknown",
        lastMessageBody: lastMsg?.body ?? null,
        unreadCount: Number(unreadCount),
      };
    })
  );

  return c.json(enriched);
});

// GET /api/conversations/:id — get a single conversation
conversationsRouter.get("/:id", async (c) => {
  const db = getDb();
  const businessId = c.get("staff").businessId;
  const conversationId = c.req.param("id");

  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)))
    .limit(1);

  if (!row) {
    return c.json({ error: "Not found" }, 404);
  }

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, row.clientId))
    .limit(1);

  return c.json({ ...row, clientName: client?.name ?? "Unknown" });
});

// GET /api/conversations/:id/messages — get messages for a conversation
conversationsRouter.get("/:id/messages", async (c) => {
  const db = getDb();
  const businessId = c.get("staff").businessId;
  const conversationId = c.req.param("id");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const cursor = c.req.query("cursor");

  // Verify staff owns this conversation
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Not found" }, 404);
  }

  // Mark conversation as read by staff
  await db
    .update(conversations)
    .set({ staffReadAt: new Date() })
    .where(eq(conversations.id, conversationId));

  if (cursor) {
    const [cursorMsg] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, cursor))
      .limit(1);

    if (cursorMsg) {
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, conversationId), lt(messages.createdAt, cursorMsg.createdAt)))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      return c.json({ messages: rows.reverse(), nextCursor: rows.length === limit ? rows[0]?.id : null });
    }
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return c.json({ messages: rows.reverse(), nextCursor: null });
});

// POST /api/conversations/:id/messages — send a message
const sendMessageSchema = z.object({
  body: z.string().min(1).max(1600),
});

conversationsRouter.post(
  "/:id/messages",
  zValidator("json", sendMessageSchema),
  async (c) => {
    const db = getDb();
    const businessId = c.get("staff").businessId;
    const staffRow = c.get("staff");
    const conversationId = c.req.param("id");
    const { body } = c.req.valid("json");

    // Verify staff owns this conversation
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.businessId, businessId)))
      .limit(1);

    if (!conversation) {
      return c.json({ error: "Not found" }, 404);
    }

    // Check if client has opted out
    const [client] = await db
      .select({ optedOutAt: clients.optedOutAt })
      .from(clients)
      .where(eq(clients.id, conversation.clientId))
      .limit(1);

    if (client?.optedOutAt) {
      return c.json({ error: "Client has opted out of SMS" }, 409);
    }

    // Create outbound message
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId,
        direction: "outbound",
        body,
        status: "queued",
        sentByStaffId: staffRow.id,
      })
      .returning();

    // Update conversation lastMessageAt
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));

    // TODO: Enqueue Telnyx outbound job

    return c.json(msg, 201);
  }
);