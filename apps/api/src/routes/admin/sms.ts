import { Hono } from "hono";
import { getDb, businessSettings, reminderLogs, eq, sql, and, gte, lt } from "@groombook/db";
import { requireRole } from "../middleware/rbac.js";
import { createSmsProvider } from "../services/sms.js";

export const adminSmsRouter = new Hono();

adminSmsRouter.get("/status", requireManager(), async (c) => {
  const db = getDb();

  const [settings] = await db.select().from(businessSettings).limit(1);

  const provider = createSmsProvider();
  const smsEnabled = process.env.SMS_ENABLED === "true";
  const providerName = process.env.SMS_PROVIDER ?? "none";
  const fromNumber = process.env.TELNYX_FROM_NUMBER ?? null;
  const connectionStatus = provider ? "connected" : "disconnected";

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const statsRows = await db
    .select({
      status: reminderLogs.deliveryStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(reminderLogs)
    .where(
      and(
        eq(reminderLogs.channel, "sms"),
        gte(reminderLogs.sentAt, startOfMonth)
      )
    )
    .groupBy(reminderLogs.deliveryStatus);

  const totals = { sent: 0, delivered: 0, failed: 0 };
  for (const row of statsRows) {
    if (row.status === "delivered") totals.delivered = row.count;
    else if (row.status === "failed") totals.failed = row.count;
    else totals.sent += row.count;
  }

  return c.json({
    providerName,
    fromNumber,
    connectionStatus,
    smsEnabled,
    businessSmsEnabled: settings?.smsEnabled ?? false,
    stats: totals,
  });
});