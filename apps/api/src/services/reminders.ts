import cron from "node-cron";
import { randomBytes } from "node:crypto";
import {
  and,
  eq,
  getDb,
  gte,
  lt,
  appointments,
  clients,
  pets,
  services,
  staff,
  reminderLogs,
  session,
} from "@groombook/db";
import {
  buildReminderEmail,
  sendEmail,
} from "./email.js";
import { smsSend } from "./sms.js";

// TCPA-required opt-out text appended to every SMS reminder
const TCPA_OPT_OUT = "Reply STOP to opt out. Msg & data rates may apply.";
function getReminderWindows(): { label: string; hours: number }[] {
  const early = Number(process.env.REMINDER_HOURS_EARLY ?? 24);
  const late = Number(process.env.REMINDER_HOURS_LATE ?? 2);
  return [
    { label: `${early}h`, hours: early },
    { label: `${late}h`, hours: late },
  ];
}

// Checks for upcoming appointments that need reminders and sends them.
// Runs every minute — idempotent via reminder_logs unique constraint.
export async function runReminderCheck(): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const window of getReminderWindows()) {
    // Target window: appointments starting between (hours - 1) and hours from now.
    // Running every minute means we check a 1-minute slice; the 1-hour window
    // ensures we catch appointments that started between heartbeats.
    const windowStart = new Date(now.getTime() + (window.hours - 1) * 3600_000);
    const windowEnd = new Date(now.getTime() + window.hours * 3600_000);

    // Find upcoming appointments in this time window that haven't been cancelled/completed
    const upcoming = await db
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        clientId: appointments.clientId,
        petId: appointments.petId,
        serviceId: appointments.serviceId,
        staffId: appointments.staffId,
        status: appointments.status,
        confirmationToken: appointments.confirmationToken,
      })
      .from(appointments)
      .where(
        and(
          gte(appointments.startTime, windowStart),
          lt(appointments.startTime, windowEnd),
          eq(appointments.status, "scheduled")
        )
      );

    for (const appt of upcoming) {
      const [emailLog] = await db
        .select({ id: reminderLogs.id })
        .from(reminderLogs)
        .where(
          and(
            eq(reminderLogs.appointmentId, appt.id),
            eq(reminderLogs.reminderType, window.label),
            eq(reminderLogs.channel, "email")
          )
        )
        .limit(1);

      const [smsLog] = await db
        .select({ id: reminderLogs.id })
        .from(reminderLogs)
        .where(
          and(
            eq(reminderLogs.appointmentId, appt.id),
            eq(reminderLogs.reminderType, window.label),
            eq(reminderLogs.channel, "sms")
          )
        )
        .limit(1);

      // Fetch related records for the email
      const [client] = await db
        .select({
          name: clients.name,
          email: clients.email,
          emailOptOut: clients.emailOptOut,
          smsOptIn: clients.smsOptIn,
          phoneE164: clients.phoneE164,
        })
        .from(clients)
        .where(eq(clients.id, appt.clientId))
        .limit(1);

      if (!client || !client.email || client.emailOptOut) continue;

      const [pet] = await db
        .select({ name: pets.name })
        .from(pets)
        .where(eq(pets.id, appt.petId))
        .limit(1);

      const [service] = await db
        .select({ name: services.name })
        .from(services)
        .where(eq(services.id, appt.serviceId))
        .limit(1);

      let groomerName: string | null = null;
      if (appt.staffId) {
        const [groomer] = await db
          .select({ name: staff.name })
          .from(staff)
          .where(eq(staff.id, appt.staffId))
          .limit(1);
        groomerName = groomer?.name ?? null;
      }

      if (!pet || !service) continue;

      let confirmationToken = appt.confirmationToken;
      if (!confirmationToken) {
        confirmationToken = randomBytes(32).toString("hex");
        await db
          .update(appointments)
          .set({ confirmationToken, updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));
      }

      if (!emailLog) {
        const sent = await sendEmail(
          buildReminderEmail(
            client.email,
            {
              clientName: client.name,
              petName: pet.name,
              serviceName: service.name,
              groomerName,
              startTime: appt.startTime,
            },
            window.hours,
            confirmationToken
          )
        );

        if (sent) {
          await db
            .insert(reminderLogs)
            .values({ appointmentId: appt.id, reminderType: window.label, channel: "email" })
            .onConflictDoNothing();
        }
      }

      if (!smsLog && client.smsOptIn && client.phoneE164) {
        const apiUrl = process.env.API_URL ?? "http://localhost:3000";
        const confirmUrl = `${apiUrl}/api/book/confirm/${confirmationToken}`;
        const cancelUrl = `${apiUrl}/api/book/cancel/${confirmationToken}`;
        const when = window.hours >= 24 ? "tomorrow" : `in ${window.hours} hours`;
        const smsBody = [
          `Hi ${client.name}, just a reminder: ${pet.name}'s grooming appointment is ${when}.`,
          `Service: ${service.name}${groomerName ? ` with ${groomerName}` : ""}`,
          `Confirm: ${confirmUrl}`,
          `Cancel: ${cancelUrl}`,
          TCPA_OPT_OUT,
        ].join(". ");
        try {
          const smsOk = await smsSend(client.phoneE164, smsBody);
          if (smsOk) {
            await db
              .insert(reminderLogs)
              .values({ appointmentId: appt.id, reminderType: window.label, channel: "sms" })
              .onConflictDoNothing();
          }
        } catch (err) {
          console.error("[reminders] SMS send failed:", err);
        }
      }
    }
  }
}

// Starts the cron scheduler. Call once at server startup.
export function startReminderScheduler(): void {
  // Run every minute
  cron.schedule("* * * * *", () => {
    runReminderCheck().catch((err) => {
      console.error("[reminders] Error during reminder check:", err);
    });
    runSessionCleanup().catch((err) => {
      console.error("[reminders] Error during session cleanup:", err);
    });
  });
  console.log("[reminders] Reminder scheduler started");
}

// Deletes expired sessions from the database.
// Runs every minute alongside reminder checks.
export async function runSessionCleanup(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .delete(session)
    .where(lt(session.expiresAt, now));
}
