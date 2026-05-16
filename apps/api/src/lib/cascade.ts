/**
 * Cascade delay prevention — `apps/api/src/lib/cascade.ts`
 *
 * Triggered after a PATCH /appointments/:id call extends an appointment's
 * endTime beyond its original value. Queries same-groomer downstream
 * appointments, shifts them forward by (overrunEnd + buffer − downstreamStart),
 * and cascades the shift through the chain. Clients are notified by email.
 *
 * Guard rails:
 *  - Only shifts `scheduled` and `confirmed` appointments.
 *  - Flags out-of-business-hours shifts for manual review instead of auto-shifting.
 *  - Returns the full list of shifted appointments.
 */

import { eq, and, gt, lte, asc, ne, inArray } from "drizzle-orm";
import { getDb, appointments, clients, pets, services, staff } from "@groombook/db";
import { sendEmail } from "../services/email.js";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface CascadeResult {
  shifted: ShiftedAppointment[];
  flaggedForReview: FlaggedAppointment[];
  /** Time in ms each downstream appointment was pushed forward */
  cascadeLog: CascadeLogEntry[];
}

export interface ShiftedAppointment {
  id: string;
  originalStartTime: Date;
  originalEndTime: Date;
  newStartTime: Date;
  newEndTime: Date;
  clientId: string;
  clientName: string;
  clientEmail: string;
  petName: string;
  serviceName: string;
  groomerName: string | null;
}

export interface FlaggedAppointment {
  id: string;
  originalStartTime: Date;
  proposedStartTime: Date;
  proposedEndTime: Date;
  reason: string;
}

export interface CascadeLogEntry {
  appointmentId: string;
  deltaMs: number;
  triggeredBy: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Default inter-appointment buffer in minutes. Overridden by services.bufferMinutes. */
export const DEFAULT_BUFFER_MINUTES = 15;

/** Default business hours (used when no settings row exists). */
export const DEFAULT_BUSINESS_START_HOUR = 8; // 08:00
export const DEFAULT_BUSINESS_END_HOUR = 18; // 18:00

// ─── Core cascade ───────────────────────────────────────────────────────────────

/**
 * Detect and cascade appointment overruns.
 *
 * @param triggeringAppointmentId  The appointment that just overran.
 * @param newEndTime               The updated endTime set by the caller.
 * @param originalEndTime          The appointment's endTime before the update.
 * @param bufferMinutes             Minutes of buffer between appointments (default 15).
 * @param businessStartHour         Business opening hour (0–23, default 8).
 * @param businessEndHour           Business closing hour (0–23, default 18).
 */
export async function cascadeDelay(
  triggeringAppointmentId: string,
  newEndTime: Date,
  originalEndTime: Date,
  bufferMinutes: number = DEFAULT_BUFFER_MINUTES,
  businessStartHour: number = DEFAULT_BUSINESS_START_HOUR,
  businessEndHour: number = DEFAULT_BUSINESS_END_HOUR
): Promise<CascadeResult> {
  const db = getDb();

  const bufferMs = bufferMinutes * 60_000;
  const overrunEnd = newEndTime;

  // ── 1. Load the triggering appointment ────────────────────────────────────────
  const [triggering] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, triggeringAppointmentId))
    .limit(1);

  if (!triggering) {
    return { shifted: [], flaggedForReview: [], cascadeLog: [] };
  }

  if (!triggering.staffId) {
    // Unassigned appointments cannot cascade
    return { shifted: [], flaggedForReview: [], cascadeLog: [] };
  }

  const groomerId = triggering.staffId;

  // ── 2. Guard: only trigger when endTime actually extended ──────────────────────
  if (overrunEnd <= originalEndTime) {
    return { shifted: [], flaggedForReview: [], cascadeLog: [] };
  }

  const result: CascadeResult = { shifted: [], flaggedForReview: [], cascadeLog: [] };

  // ── 3. Fetch all downstream same-groomer active appointments ──────────────────
  const downstream = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.staffId, groomerId),
        gt(appointments.startTime, originalEndTime),
        inArray(appointments.status, ["scheduled", "confirmed"]),
      )
    )
    .orderBy(asc(appointments.startTime));

  if (downstream.length === 0) return result;

  // ── 4. Cascade loop ────────────────────────────────────────────────────────────
  // Keep track of current effective boundary after each shift.
  // Start from the new endTime of the triggering appointment plus buffer.
  let effectiveBoundary = new Date(overrunEnd.getTime() + bufferMs);

  for (const appt of downstream) {
    const conflictStart = appt.startTime;
    const conflictEnd = appt.endTime;
    const apptDurationMs = conflictEnd.getTime() - conflictStart.getTime();

    // Does this appointment overlap the effective boundary?
    if (effectiveBoundary.getTime() >= conflictEnd.getTime()) {
      // No conflict — this appointment and all later ones are unaffected
      break;
    }

    const proposedStart = new Date(effectiveBoundary);
    const proposedEnd = new Date(proposedStart.getTime() + apptDurationMs);

    // ── Business-hours guard ────────────────────────────────────────────────────
    const proposedStartHour = proposedStart.getHours() + proposedStart.getMinutes() / 60;
    const proposedEndHour = proposedEnd.getHours() + proposedEnd.getMinutes() / 60;
    const outOfHours =
      proposedStartHour < businessStartHour ||
      proposedEndHour > businessEndHour;

    if (outOfHours) {
      result.flaggedForReview.push({
        id: appt.id,
        originalStartTime: appt.startTime,
        proposedStartTime: proposedStart,
        proposedEndTime: proposedEnd,
        reason:
          `Would push appointment outside business hours ` +
          `(${businessStartHour}:00–${businessEndHour}:00). ` +
          `Manual review required.`,
      });
      // Update boundary anyway — later appointments may still conflict
      effectiveBoundary = new Date(proposedEnd.getTime() + bufferMs);
      continue;
    }

    // ── Perform the shift ──────────────────────────────────────────────────────
    const deltaMs = proposedStart.getTime() - appt.startTime.getTime();

    await db
      .update(appointments)
      .set({ startTime: proposedStart, endTime: proposedEnd, updatedAt: new Date() })
      .where(eq(appointments.id, appt.id));

    result.cascadeLog.push({
      appointmentId: appt.id,
      deltaMs,
      triggeredBy: triggeringAppointmentId,
    });

    // ── Load client/pet/service info for notification ──────────────────────────
    const enriched = await enrichAppointment(appt.id);
    if (enriched) {
      result.shifted.push({
        id: appt.id,
        originalStartTime: appt.startTime,
        originalEndTime: appt.endTime,
        newStartTime: proposedStart,
        newEndTime: proposedEnd,
        ...enriched,
      });
    }

    // Advance boundary to the end of this shifted appointment plus buffer
    effectiveBoundary = new Date(proposedEnd.getTime() + bufferMs);
  }

  // ── 5. Send notifications ────────────────────────────────────────────────────
  for (const shifted of result.shifted) {
    await sendRescheduleNotification(shifted).catch((err) =>
      console.error(`[cascade] Failed to send notification for ${shifted.id}:`, err)
    );
  }

  return result;
}

/**
 * Shortcut for status-transition overruns (current time > endTime + bufferMinutes).
 * Delegates to `cascadeDelay` using the current appointment data.
 */
export async function cascadeOnStatusOverrun(
  appointmentId: string,
  bufferMinutes: number = DEFAULT_BUFFER_MINUTES,
  businessStartHour: number = DEFAULT_BUSINESS_START_HOUR,
  businessEndHour: number = DEFAULT_BUSINESS_END_HOUR
): Promise<CascadeResult> {
  const db = getDb();
  const [appt] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);

  if (!appt) return { shifted: [], flaggedForReview: [], cascadeLog: [] };

  const now = new Date();
  const bufferMs = bufferMinutes * 60_000;

  if (now.getTime() <= appt.endTime.getTime() + bufferMs) {
    // Not actually in overrun
    return { shifted: [], flaggedForReview: [], cascadeLog: [] };
  }

  // Use current time as the new endTime (the appointment is already running over)
  return cascadeDelay(
    appointmentId,
    now,
    appt.endTime,
    bufferMinutes,
    businessStartHour,
    businessEndHour
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

interface EnrichedFields {
  clientId: string;
  clientName: string;
  clientEmail: string;
  petName: string;
  serviceName: string;
  groomerName: string | null;
}

async function enrichAppointment(
  apptId: string
): Promise<EnrichedFields | null> {
  const db = getDb();
  const [row] = await db
    .select({
      clientId: appointments.clientId,
      clientName: clients.name,
      clientEmail: clients.email,
      petName: pets.name,
      serviceName: services.name,
      groomerName: staff.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(staff, eq(staff.id, appointments.staffId))
    .where(eq(appointments.id, apptId))
    .limit(1);

  if (!row) return null;
  return {
    clientId: row.clientId,
    clientName: row.clientName,
    clientEmail: row.clientEmail,
    petName: row.petName,
    serviceName: row.serviceName,
    groomerName: row.groomerName,
  };
}

async function sendRescheduleNotification(
  shifted: ShiftedAppointment
): Promise<void> {
  const time = formatDateTime(shifted.newStartTime);
  const original = formatDateTime(shifted.originalStartTime);
  const groomer = shifted.groomerName ? ` with ${shifted.groomerName}` : "";

  await sendEmail({
    to: shifted.clientEmail,
    subject: `Appointment Rescheduled — ${shifted.petName}`,
    text: [
      `Hi ${shifted.clientName},`,
      ``,
      `Your appointment for ${shifted.petName} has been rescheduled.`,
      ``,
      `  Was:    ${original}${groomer}`,
      `  Now:    ${time}${groomer}`,
      ``,
      `We apologize for any inconvenience. If this new time doesn't work for you, please contact us as soon as possible.`,
      ``,
      `— Groom Book`,
    ].join("\n"),
    html: `<p>Hi ${shifted.clientName},</p>
<p>Your appointment for <strong>${shifted.petName}</strong> has been rescheduled.</p>
<table style="border-collapse:collapse;margin:1em 0">
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">Previous time</td><td style="text-decoration:line-through;color:#9ca3af">${original}${groomer}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;font-weight:600;color:#6b7280">New time</td><td>${time}${groomer}</td></tr>
</table>
<p>If this new time doesn't work for you, please contact us as soon as possible.</p>
<p>— Groom Book</p>`,
  });

  console.info(
    `[cascade] Notified ${shifted.clientEmail} of reschedule for ${shifted.petName} ` +
      `(${shifted.id}): ${original} → ${time}`
  );
}

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}