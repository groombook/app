import { Hono } from "hono";
import { createHmac } from "crypto";
import {
  handleMessageReceived,
  handleMessageFinalized,
  TelnyxMessageReceivedPayload,
} from "../../services/messaging/inbound.js";

export const telnyxWebhooksRouter = new Hono();

function validateTelnyxSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.TELNYX_WEBHOOK_SECRET;
  if (!secret) return false;

  try {
    const hmac = createHmac("sha256", secret);
    const expected = `sha256=${hmac.update(rawBody).digest("hex")}`;

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

telnyxWebhooksRouter.post("/messaging", async (c) => {
  const signature = c.req.header("telnyx-signature");

  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ error: "Could not read body" }, 400);
  }

  if (!validateTelnyxSignature(rawBody, signature ?? null)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let payload: TelnyxMessageReceivedPayload;
  try {
    payload = JSON.parse(rawBody) as TelnyxMessageReceivedPayload;
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventType = payload.data?.event_type;
  if (!eventType) {
    return c.json({ error: "Missing event_type" }, 400);
  }

  if (eventType === "message.received") {
    try {
      await handleMessageReceived(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.startsWith("No business owns")) {
        return c.json({ error: "Unknown messaging number" }, 404);
      }
      return c.json({ error: msg }, 500);
    }
    return c.json({ received: true });
  }

  if (eventType === "message.finalized") {
    const result = await handleMessageFinalized(payload);
    if (result) {
      return c.json({ received: true, messageId: result.messageId, status: result.newStatus });
    }
    return c.json({ received: true, messageId: null });
  }

  return c.json({ received: true });
});