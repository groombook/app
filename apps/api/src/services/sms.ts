import { Telnyx } from "telnyx";
import { createHmac } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { getDb, conversations, messages, businessSettings, eq, and } from "@groombook/db";

export interface SmsProvider {
  sendSms(to: string, body: string, mediaUrls?: string[]): Promise<{ messageId: string; status: string }>;
  validateWebhookSignature(req: Request): boolean;
}

interface TelnyxSmsResult {
  message_id: string;
  status: string;
}

function createTelnyxClient(): Telnyx | null {
  const apiKey = process.env.TELNYX_API_KEY;
  if (!apiKey) return null;
  return new Telnyx(apiKey);
}

let _client: Telnyx | null | undefined;

function getClient(): Telnyx | null {
  if (_client === undefined) _client = createTelnyxClient();
  return _client;
}

function getFromNumber(): string | null {
  return process.env.TELNYX_FROM_NUMBER ?? null;
}

function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

async function findOrCreateConversationForOutbound(
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

  const clientId = uuidv4();

  const [created] = await db
    .insert(conversations)
    .values({
      id: uuidv4(),
      businessId,
      clientId,
      channel: "sms",
      externalNumber: clientPhone,
      businessNumber,
      lastMessageAt: new Date(),
      status: "active",
    })
    .returning({ id: conversations.id, clientId: conversations.clientId });

  return { id: created.id, clientId: created.clientId };
}

export async function sendSms(
  to: string,
  body: string,
  mediaUrls?: string[]
): Promise<{ messageId: string; status: string }> {
  const client = getClient();
  if (!client) throw new Error("Telnyx client not initialized. Set TELNYX_API_KEY.");

  const from = getFromNumber();
  if (!from) throw new Error("TELNYX_FROM_NUMBER is not set");

  if (!isE164(to)) throw new Error(`Invalid recipient phone format: ${to}. Expected E.164.`);
  if (!isE164(from)) throw new Error(`Invalid sender phone format: ${from}. Expected E.164.`);

  const payload: Record<string, unknown> = {
    from,
    to,
    body,
  };

  if (mediaUrls && mediaUrls.length > 0) {
    payload.media_urls = mediaUrls;
  }

  const result = await client.messages.create(payload as Record<string, string | string[]>);
  const smsResult = result.data as unknown as TelnyxSmsResult;

  const db = getDb();
  const [settings] = await db
    .select({ id: businessSettings.id })
    .from(businessSettings)
    .where(eq(businessSettings.messagingPhoneNumber, from))
    .limit(1);

  if (settings?.id) {
    const { id: conversationId } = await findOrCreateConversationForOutbound(
      settings.id,
      to,
      from
    );

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await db
      .insert(messages)
      .values({
        id: uuidv4(),
        conversationId,
        direction: "outbound",
        body,
        status: "sent",
        providerMessageId: smsResult.message_id,
      });
  }

  return {
    messageId: smsResult.message_id,
    status: smsResult.status,
  };
}

export class TelnyxProvider implements SmsProvider {
  async sendSms(
    to: string,
    body: string,
    mediaUrls?: string[]
  ): Promise<{ messageId: string; status: string }> {
    return sendSms(to, body, mediaUrls);
  }

  validateWebhookSignature(req: Request): boolean {
    const secret = process.env.TELNYX_WEBHOOK_SECRET;
    if (!secret) return false;

    const signature = req.headers.get("telnyx-signature");
    if (!signature) return false;

    const payload = JSON.stringify(req.body);

    try {
      const hmac = createHmac("sha256", secret);
      const expected = `sha256=${hmac.update(payload).digest("hex")}`;

      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);

      if (sigBuf.length !== expBuf.length) return false;

      let diff = 0;
      for (let i = 0; i < sigBuf.length; i++) {
        const sigByte = sigBuf[i] ?? 0;
        const expByte = expBuf[i] ?? 0;
        diff |= sigByte ^ expByte;
      }
      return diff === 0;
    } catch {
      return false;
    }
  }
}

let _provider: SmsProvider | null | undefined;

export function createSmsProvider(): SmsProvider | null {
  if (_provider === undefined) {
    if (process.env.SMS_ENABLED !== "true") {
      _provider = null;
      return null;
    }
    switch (process.env.SMS_PROVIDER) {
      case "telnyx": {
        const client = getClient();
        if (!client) {
          _provider = null;
          return null;
        }
        _provider = new TelnyxProvider();
        break;
      }
      default:
        _provider = null;
    }
  }
  return _provider;
}

export async function smsSend(
  to: string,
  body: string,
  mediaUrls?: string[]
): Promise<boolean> {
  const provider = createSmsProvider();
  if (!provider) return false;

  await provider.sendSms(to, body, mediaUrls);
  return true;
}