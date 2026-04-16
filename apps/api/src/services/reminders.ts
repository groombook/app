import cron from "node-cron";
import { randomBytes } from "node:crypto";
import {
  and,
  eq,
  getDb,
  gte,
  lt,
  sql,
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
    const windowStart = new Date(now.getTime() + (window.hours - 1) * 3600_000);
    const windowEnd = new Date(now.getTime() + window.hours * 3600_000);

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

    const appointmentIds: string[] = upcoming.map((a) => a.id as string);

    if (appointmentIds.length === 0) continue;

    // Batch-fetch already-sent appointment IDs (both EMAIL and SMS channels)
    const sentAppointmentIds = new Set(
      (
        await db
          .select({ appointmentId: reminderLogs.appointmentId })
          .from(reminderLogs)
          .where(
            and(
              eq(reminderLogs.reminderType, window.label),
              appointmentIds.length === 1
                ? eq(reminderLogs.appointmentId, appointmentIds[0]!)
                : sql`${reminderLogs.appointmentId} = ANY(${appointmentIds})`
            )
          )
      ).map((r) => r.appointmentId)
    );

    // Batch-fetch all appointment data with related joins in a single query
    const joinedRows = await db
      .select({
        appointmentId: appointments.id,
        startTime: appointments.startTime,
        clientId: appointments.clientId,
        petId: appointments.petId,
        serviceId: appointments.serviceId,
        staffId: appointments.staffId,
        confirmationToken: appointments.confirmationToken,
        clientName: clients.name,
        clientEmail: clients.email,
        clientEmailOptOut: clients.emailOptOut,
        clientPhone: clients.phone,
        clientSmsOptIn: clients.smsOptIn,
        petName: pets.name,
        serviceName: services.name,
        staffName: staff.name,
      })
      .from(appointments)
      .innerJoin(clients, eq(appointments.clientId, clients.id))
      .innerJoin(pets, eq(appointments.petId, pets.id))
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(
        and(
          sql`${appointments.id} = ANY(${appointmentIds})`,
          gte(appointments.startTime, windowStart),
          lt(appointments.startTime, windowEnd),
          eq(appointments.status, "scheduled")
        )
      );

    const appointmentMap = new Map<string, typeof joinedRows[number]>();
    for (const row of joinedRows) {
      appointmentMap.set(row.appointmentId, row);
    }

    for (const appt of upcoming) {
      // Already sent a reminder for this appointment in this window
      if (sentAppointmentIds.has(appt.id)) continue;

      const row = appointmentMap.get(appt.id);
      if (!row) continue;
      if (!row.petName || !row.serviceName) continue;

      // Generate confirmation token if missing
      let confirmationToken = appt.confirmationToken;
      if (!confirmationToken) {
        confirmationToken = randomBytes(32).toString("hex");
        await db
          .update(appointments)
          .set({ confirmationToken, updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));
      }

      const clientName = row.clientName;
      const petName = row.petName;
      const serviceName = row.serviceName;
      const groomerName = row.staffName ?? null;
      const startTime = appt.startTime;

      // EMAIL reminder
      if (row.clientEmail && !row.clientEmailOptOut) {
        const sent = await sendEmail(
          buildReminderEmail(
            row.clientEmail,
            { clientName, petName, serviceName, groomerName, startTime },
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

      // SMS reminder
      if (row.clientPhone && row.clientSmsOptIn) {
        const apiUrl = process.env.API_URL ?? "http://localhost:3000";
        const confirmUrl = `${apiUrl}/api/book/confirm/${confirmationToken}`;
        const cancelUrl = `${apiUrl}/api/book/cancel/${confirmationToken}`;
        const when = window.hours >= 24 ? "tomorrow" : `in ${window.hours} hours`;
        const smsBody = [
          `Hi ${clientName}, just a reminder: ${petName}'s grooming appointment is ${when}.`,
          `Service: ${serviceName}${groomerName ? ` with ${groomerName}` : ""}`,
          `Confirm: ${confirmUrl}`,
          `Cancel: ${cancelUrl}`,
          TCPA_OPT_OUT,
        ].join(". ");
        try {
          const smsOk = await smsSend(row.clientPhone, smsBody);
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

export function startReminderScheduler(): void {
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

export async function runSessionCleanup(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .delete(session)
    .where(lt(session.expiresAt, now));
}
