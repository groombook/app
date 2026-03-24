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

    for (const appt of upcoming) {
      // Check if reminder already sent (unique constraint prevents double-send)
      const existing = await db
        .select({ id: reminderLogs.id })
        .from(reminderLogs)
        .where(
          and(
            eq(reminderLogs.appointmentId, appt.id),
            eq(reminderLogs.reminderType, window.label)
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // already sent

      // Fetch related records for the email
      const [client] = await db
        .select({ name: clients.name, email: clients.email, emailOptOut: clients.emailOptOut })
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

      // Ensure the appointment has a confirmation token before sending the reminder.
      // Generate one if it doesn't have one yet (e.g. pre-existing appointments).
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
        // Record send — ignore conflicts (race condition between instances)
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
  });
  console.log("[reminders] Reminder scheduler started");
}
