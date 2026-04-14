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

// How many hours before the appointment to send each reminder.
// Override via env: REMINDER_HOURS_EARLY (default 24) and REMINDER_HOURS_LATE (default 2).
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

    const appointmentIds: string[] = upcoming.map((a) => a.id as string);

    if (appointmentIds.length === 0) continue;

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
      if (sentAppointmentIds.has(appt.id)) continue;

      const row = appointmentMap.get(appt.id);
      if (!row) continue;
      if (!row.clientEmail || row.clientEmailOptOut) continue;
      if (!row.petName || !row.serviceName) continue;

      let confirmationToken = appt.confirmationToken;
      if (!confirmationToken) {
        confirmationToken = randomBytes(32).toString("hex");
        await db
          .update(appointments)
          .set({ confirmationToken, updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));
      }

      const sent = await sendEmail(
        buildReminderEmail(
          row.clientEmail,
          {
            clientName: row.clientName,
            petName: row.petName,
            serviceName: row.serviceName,
            groomerName: row.staffName ?? null,
            startTime: appt.startTime,
          },
          window.hours,
          confirmationToken
        )
      );

      if (sent) {
        await db
          .insert(reminderLogs)
          .values({ appointmentId: appt.id, reminderType: window.label })
          .onConflictDoNothing();
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
