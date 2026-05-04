import { getDb, conversations, messages, clients, businessSettings, eq, and } from "@groombook/db";
import { v4 as uuidv4 } from "uuid";
import { sendSms } from "../sms.js";

export interface SendMessageOptions {
  businessId: string;
  clientId: string;
  body: string;
  sentByStaffId?: string;
  mediaUrls?: string[];
}

export interface SendMessageResult {
  messageId: string;
  providerMessageId: string;
  status: string;
  suppressed: false;
}

export interface SendMessageSuppressed {
  suppressed: true;
}

export type SendMessageResponse = SendMessageResult | SendMessageSuppressed;

export class MissingTenantPhoneNumberError extends Error {
  constructor() {
    super("Tenant messagingPhoneNumber is not configured");
    this.name = "MissingTenantPhoneNumberError";
  }
}

async function findOrCreateConversation(
  businessId: string,
  clientId: string,
  externalNumber: string,
  businessNumber: string
): Promise<{ id: string }> {
  const db = getDb();

  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.externalNumber, externalNumber),
        eq(conversations.businessNumber, businessNumber)
      )
    )
    .limit(1);

  if (existing) return { id: existing.id };

  const [created] = await db
    .insert(conversations)
    .values({
      id: uuidv4(),
      businessId,
      clientId,
      channel: "sms",
      externalNumber,
      businessNumber,
      lastMessageAt: new Date(),
      status: "active",
    })
    .returning({ id: conversations.id });

  if (!created) throw new Error("Failed to create conversation");

  return { id: created.id };
}

async function resolveFromNumber(businessId: string): Promise<string | null> {
  const db = getDb();
  const [settings] = await db
    .select({ messagingPhoneNumber: businessSettings.messagingPhoneNumber })
    .from(businessSettings)
    .where(eq(businessSettings.id, businessId))
    .limit(1);
  return settings?.messagingPhoneNumber ?? null;
}

export async function sendMessage(opts: SendMessageOptions): Promise<SendMessageResponse> {
  const db = getDb();
  const { businessId, clientId, body, sentByStaffId, mediaUrls } = opts;

  const [client] = await db
    .select({ phone: clients.phone, smsOptIn: clients.smsOptIn })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!client?.phone) {
    return { suppressed: true };
  }

  if (!client.smsOptIn) {
    return { suppressed: true };
  }

  const from = await resolveFromNumber(businessId);
  if (!from) throw new MissingTenantPhoneNumberError();

  const to = client.phone;
  const conversationId = (await findOrCreateConversation(businessId, clientId, to, from)).id;

  const [queuedMessage] = await db
    .insert(messages)
    .values({
      id: uuidv4(),
      conversationId,
      direction: "outbound",
      body,
      status: "queued",
      sentByStaffId: sentByStaffId ?? null,
    })
    .returning({ id: messages.id });

  if (!queuedMessage) throw new Error("Failed to insert queued message");

  try {
    const result = await sendSms(to, body, mediaUrls);

    await db
      .update(messages)
      .set({
        status: "sent",
        providerMessageId: result.messageId,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, queuedMessage.id));

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return {
      messageId: queuedMessage.id,
      providerMessageId: result.messageId,
      status: result.status,
      suppressed: false,
    };
  } catch (err) {
    const errorCode = err instanceof Error ? err.name : "UNKNOWN";
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(messages)
      .set({
        status: "failed",
        errorCode,
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, queuedMessage.id));

    throw err;
  }
}