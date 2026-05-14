import { db, clients, messageConsentEvents, businessSettings, eq } from "@groombook/db";

export type KeywordKind = "opt_in" | "opt_out" | "help";

const OPT_OUT_KEYWORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const OPT_IN_KEYWORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
const HELP_KEYWORDS = new Set(["HELP", "INFO"]);

export function detectKeyword(body: string): { kind: KeywordKind } | null {
  const normalized = body.trim().toUpperCase();
  if (OPT_OUT_KEYWORDS.has(normalized)) return { kind: "opt_out" };
  if (OPT_IN_KEYWORDS.has(normalized)) return { kind: "opt_in" };
  if (HELP_KEYWORDS.has(normalized)) return { kind: "help" };
  return null;
}

export async function handleConsentKeyword(opts: {
  clientId: string;
  businessId: string;
  kind: KeywordKind;
  db: typeof import("@groombook/db").db;
}): Promise<{ replyText: string }> {
  const { clientId, businessId, kind, db: database } = opts;

  await database.insert(messageConsentEvents).values({
    clientId,
    businessId,
    kind,
    source: "sms_keyword",
  });

  if (kind === "opt_out") {
    const [existing] = await database
      .select({ smsOptIn: clients.smsOptIn })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (existing?.smsOptIn !== false) {
      await database
        .update(clients)
        .set({ smsOptIn: false, smsOptOutDate: new Date() })
        .where(eq(clients.id, clientId));
    }

    return {
      replyText: "You have been unsubscribed and will no longer receive messages. Reply START to resubscribe.",
    };
  }

  if (kind === "opt_in") {
    const [existing] = await database
      .select({ smsOptIn: clients.smsOptIn, smsConsentDate: clients.smsConsentDate })
      .from(clients)
      .where(eq(clients.id, clientId))
      .limit(1);

    if (existing?.smsOptIn !== true) {
      await database
        .update(clients)
        .set({ smsOptIn: true, smsConsentDate: new Date(), smsOptOutDate: null })
        .where(eq(clients.id, clientId));
    }

    return {
      replyText:
        "You have been resubscribed to messages. Reply STOP to unsubscribe. Msg & data rates may apply.",
    };
  }

  // kind === "help"
  const [settings] = await database
    .select({ messagingHelpReply: businessSettings.messagingHelpReply })
    .from(businessSettings)
    .where(eq(businessSettings.id, businessId))
    .limit(1);

  const replyText =
    settings?.messagingHelpReply ??
    "Reply STOP to unsubscribe or START to resubscribe. For help, contact your groomer directly.";

  return { replyText };
}