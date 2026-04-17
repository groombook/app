import cron from "node-cron";
import { randomBytes } from "node:crypto";
import {
  and,
  eq,
  getDb,
  gte,
  inArray,
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

const TCPA_OPT_OUT = "Reply STOP to opt out. Msg & data rates may apply.";

function getReminderWindows(): { label: string; hours: number }[] {
  const early = Number(process.env.REMINDER_HOURS_EARLY ?? 24);
  const late = Number(process.env.REMINDER_HOURS_LATE ?? 2);
  return [
    { label: `${early}h`, hours: early },
    { label: `${late}h`, hours: late },
  ];
}

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

    // Bulk check: which appointments already have email and SMS reminders sent?
    const sentRows = await db
      .select({ appointmentId: reminderLogs.appointmentId, channel: reminderLogs.channel })
      .from(reminderLogs)
      .where(
        and(
          eq(reminderLogs.reminderType, window.label),
          appointmentIds.length === 1
            ? eq(reminderLogs.appointmentId, appointmentIds[0]!)
            : inArray(reminderLogs.appointmentId, appointmentIds)
        )
      );

    const sentEmail = new Set(
      sentRows.filter((r) => r.channel === "email").map((r) => r.appointmentId)
    );
    const sentSms = new Set(
      sentRows.filter((r) => r.channel === "sms").map((r) => r.appointmentId)
    );

    // Bulk JOIN: fetch all client/pet/service/staff data in one query
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
        clientSmsOptIn: clients.smsOptIn,
        clientPhone: clients.phone,
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
      const joined = appointmentMap.get(appt.id as string);
      if (!joined) continue;

      const { clientName, clientEmail, clientEmailOptOut, clientSmsOptIn, clientPhone, petName, serviceName, staffName } = joined;

      if (!clientEmail || clientEmailOptOut) continue;
      if (!petName || !serviceName) continue;

      const emailSent = sentEmail.has(appt.id as string);
      const smsSent = sentSms.has(appt.id as string);

      let confirmationToken = appt.confirmationToken;
      if (!confirmationToken) {
        confirmationToken = randomBytes(32).toString("hex");
        await db
          .update(appointments)
          .set({ confirmationToken, updatedAt: new Date() })
          .where(eq(appointments.id, appt.id));
      }

      if (!emailSent) {
        const sent = await sendEmail(
          buildReminderEmail(
            clientEmail,
            {
              clientName,
              petName,
              serviceName,
              groomerName: staffName,
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

      if (!smsSent && clientSmsOptIn && clientPhone) {
        const apiUrl = process.env.API_URL ?? "http://localhost:3000";
        const confirmUrl = `${apiUrl}/api/book/confirm/${confirmationToken}`;
        const cancelUrl = `${apiUrl}/api/book/cancel/${confirmationToken}`;
        const when = window.hours >= 24 ? "tomorrow" : `in ${window.hours} hours`;
        const smsBody = [
          `Hi ${clientName}, just a reminder: ${petName}'s grooming appointment is ${when}.`,
          `Service: ${serviceName}${staffName ? ` with ${staffName}` : ""}`,
          `Confirm: ${confirmUrl}`,
          `Cancel: ${cancelUrl}`,
          TCPA_OPT_OUT,
        ].join(". ");
        try {
          const smsOk = await smsSend(clientPhone, smsBody);
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
