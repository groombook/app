import { Hono } from "hono";
import {
  and,
  eq,
  getDb,
  clients,
  reminderLogs,
  smsSend,
} from "@groombook/db";
import { TelnyxProvider } from "../services/sms.js";

export const webhooksRouter = new Hono();

const telnyxProvider = new TelnyxProvider();

const STOP_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

webhooksRouter.post("/sms/inbound", async (c) => {
  if (!telnyxProvider.validateWebhookSignature(c.req.raw)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const event = (body.data as Record<string, unknown>)?.event_type ?? body.event_type;
  const payload = (body.data as Record<string, unknown>) ?? body;

  if (event === "message.received") {
    const fromField = payload.from;
    const from = typeof fromField === "object" && fromField !== null
      ? (fromField as Record<string, unknown>).phone_number as string ?? (fromField as Record<string, unknown>).toString()
      : String(fromField ?? "");
    const text = String(payload.text ?? payload.body ?? "").trim().toUpperCase();

    if (!from || !text) {
      return c.json({ error: "Missing from or text" }, 400);
    }

    const db = getDb();

    const [client] = await db
      .select({ id: clients.id, smsOptIn: clients.smsOptIn })
      .from(clients)
      .where(eq(clients.phone, from))
      .limit(1);

    if (!client) {
      return c.json({ received: true });
    }

    if (STOP_KEYWORDS.has(text)) {
      await db
        .update(clients)
        .set({
          smsOptIn: false,
          smsOptOutDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));
      return c.json({ received: true });
    }

    if (START_KEYWORDS.has(text)) {
      await db
        .update(clients)
        .set({
          smsOptIn: true,
          smsConsentDate: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));
      return c.json({ received: true });
    }

    if (text === "HELP") {
      const supportUrl = process.env.SUPPORT_URL ?? "https://groombook.app/support";
      await smsSend(from, `GroomBook appointment reminders. Reply STOP to opt out. For help, visit ${supportUrl}.`);
      return c.json({ received: true });
    }

    return c.json({ received: true });
  }

  if (event === "message.finalized" || event === "message.status") {
    const status = String(payload.status ?? "");
    const toField = payload.to;
    const toNumber = typeof toField === "object" && toField !== null
      ? (toField as Record<string, unknown>).phone_number as string ?? (toField as Record<string, unknown>).toString()
      : String(toField ?? "");

    if (!status || !toNumber) {
      return c.json({ received: true });
    }

    const validDelivery = ["delivered", "sent", "failed", "sending", "queued"];
    if (!validDelivery.includes(status)) {
      return c.json({ received: true });
    }

    const db = getDb();

    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.phone, toNumber))
      .limit(1);

    if (client) {
      const [log] = await db
        .select({ id: reminderLogs.id })
        .from(reminderLogs)
        .where(
          and(
            eq(reminderLogs.channel, "sms")
          )
        )
        .limit(1);

      if (log) {
        await db
          .update(reminderLogs)
          .set({ deliveryStatus: status })
          .where(eq(reminderLogs.id, log.id));
      }
    }

    return c.json({ received: true });
  }

  return c.json({ received: true });
});