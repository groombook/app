import { getDb, conversations, messages, businessSettings, clients, eq, and } from "@groombook/db";
import { v4 as uuidv4 } from "uuid";

export interface TelnyxMessageReceivedPayload {
  data: {
    id: string;
    event_type: "message.received" | "message.sent" | "message.finalized";
    payload: {
      message: {
        id: string;
        from: { phone: string; carrier?: string };
        to: { phone: string }[];
        body: string;
        media?: Array<{ type: string; url: string }>;
      };
      recording?: unknown;
      leg_count?: number;
    };
  };
}

export async function findOrCreateConversation(
  businessId: string,
  clientPhone: string,
  businessNumber: string
): Promise<{ id: string; clientId: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: conversations.id, clientId: conversations.clientId })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.externalNumber, clientPhone),
        eq(conversations.businessNumber, businessNumber)
      )
    )
    .limit(1);

  if (existing) {
    return { id: existing.id, clientId: existing.clientId };
  }

  const [existingClient] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.phone, clientPhone))
    .limit(1);

  const clientId = existingClient?.id ?? uuidv4();

  if (!existingClient) {
    await db.insert(clients).values({
      id: clientId,
      name: clientPhone,
      email: `sms-${uuidv4()}@placeholder.local`,
      phone: clientPhone,
      status: "active",
    });
  }

  const [created] = await db
    .insert(conversations)
    .values({
      id: crypto.randomUUID(),
      businessId,
      clientId,
      channel: "sms",
      externalNumber: clientPhone,
      businessNumber,
      lastMessageAt: new Date(),
      status: "active",
    })
    .returning({ id: conversations.id, clientId: conversations.clientId });

  if (!created) throw new Error("Failed to create conversation");

  return { id: created.id, clientId: created.clientId };
}

export async function upsertMessage(
  providerMessageId: string,
  conversationId: string,
  direction: "inbound" | "outbound",
  body: string,
  status: "queued" | "sent" | "delivered" | "failed" | "received",
  sentByStaffId?: string
): Promise<{ id: string; isNew: boolean }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.providerMessageId, providerMessageId))
    .limit(1);

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  try {
    const [inserted] = await db
      .insert(messages)
      .values({
        id: crypto.randomUUID(),
        conversationId,
        direction,
        body,
        status,
        providerMessageId,
        sentByStaffId: sentByStaffId ?? null,
      })
      .returning({ id: messages.id });

    if (!inserted) throw new Error("Failed to insert message");
    return { id: inserted.id, isNew: true };
  } catch (err) {
    if (err instanceof Error && err.message.includes("unique")) {
      const [existing] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(eq(messages.providerMessageId, providerMessageId))
        .limit(1);
      if (existing) return { id: existing.id, isNew: false };
    }
    throw err;
  }
}

export async function resolveBusinessIdByMessagingNumber(toNumber: string): Promise<string | null> {
  const db = getDb();
  const [settings] = await db
    .select({ id: businessSettings.id })
    .from(businessSettings)
    .where(eq(businessSettings.messagingPhoneNumber, toNumber))
    .limit(1);
  return settings?.id ?? null;
}

export async function handleMessageReceived(payload: TelnyxMessageReceivedPayload): Promise<{ conversationId: string; messageId: string }> {
  const { message } = payload.data.payload;
  const fromPhone = message.from.phone;
  const toPhone = message.to[0]?.phone;

  if (!toPhone) {
    throw new Error("No recipient phone in payload");
  }

  const businessId = await resolveBusinessIdByMessagingNumber(toPhone);
  if (!businessId) {
    throw new Error(`No business owns messaging number: ${toPhone}`);
  }

  const { id: conversationId } = await findOrCreateConversation(businessId, fromPhone, toPhone);

  await getDb()
    .update(conversations)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  const { id: messageId } = await upsertMessage(
    message.id,
    conversationId,
    "inbound",
    message.body,
    "received"
  );

  return { conversationId, messageId };
}

export async function handleMessageFinalized(payload: TelnyxMessageReceivedPayload): Promise<{ messageId: string; newStatus: string } | null> {
  const { message } = payload.data.payload;

  if (!message.id) return null;

  const db = getDb();
  const [existing] = await db
    .select({ id: messages.id, status: messages.status })
    .from(messages)
    .where(eq(messages.providerMessageId, message.id))
    .limit(1);

  if (!existing) return null;

  let newStatus = existing.status;
  if (payload.data.event_type === "message.finalized") {
    newStatus = "delivered";
  }

  if (newStatus !== existing.status) {
    await db
      .update(messages)
      .set({ status: newStatus, deliveredAt: new Date() })
      .where(eq(messages.id, existing.id));
  }

  return { messageId: existing.id, newStatus };
}
