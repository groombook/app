import { eq, and, gt, gte, lt, ne, or, asc } from "@groombook/db";
import { appointments, clients, pets, services, staff, type Db } from "@groombook/db";
import { resolveBufferMinutes } from "./buffer.js";
import { sendEmail, buildRescheduleNotificationEmail } from "../services/email.js";

export interface CascadeResult {
  shifted: ShiftedAppointment[];
  flaggedForReview: FlaggedAppointment[];
}

export interface ShiftedAppointment {
  id: string;
  oldStartTime: Date;
  oldEndTime: Date;
  newStartTime: Date;
  newEndTime: Date;
  shiftDeltaMs: number;
}

export interface FlaggedAppointment {
  id: string;
  reason: string;
  requestedStartTime: Date;
  requestedEndTime: Date;
}

interface AppointmentWithGroomer {
  id: string;
  clientId: string;
  petId: string;
  serviceId: string;
  staffId: string | null;
  batherStaffId: string | null;
  status: string;
  startTime: Date;
  endTime: Date;
  bufferMinutes: number;
}

/**
 * Detects and cascades appointment overruns to downstream same-groomer appointments.
 *
 * Trigger conditions:
 * - PATCH extends endTime beyond the original endTime
 * - Status transitions where current time exceeds endTime + bufferMinutes
 *
 * Guard rails:
 * - Only shifts `scheduled` and `confirmed` appointments
 * - Skips `in_progress`, `completed`, `cancelled`, `no_show`
 * - Flags appointments that would fall outside business hours for manual review
 */
export async function detectAndCascadeOverrun({
  db,
  overrunningAppointmentId,
  newEndTime,
  originalEndTime,
}: {
  db: Db;
  overrunningAppointmentId: string;
  newEndTime: Date;
  originalEndTime: Date;
}): Promise<CascadeResult> {
  const result: CascadeResult = { shifted: [], flaggedForReview: [] };

  // Fetch the overrunning appointment to get groomer/staff info
  const [overrunning] = await db
    .select()
    .from(appointments)
    .where(eq(appointments.id, overrunningAppointmentId))
    .limit(1);

  if (!overrunning) return result;

  const groomerId = overrunning.staffId;
  if (!groomerId) return result;

  // Determine the effective buffer for the overrunning appointment
  const bufferMinutes = await resolveBufferMinutesForAppointment(db, overrunning);
  const overrunEnd = newEndTime;
  const effectiveEnd = new Date(overrunEnd.getTime() + bufferMinutes * 60_000);

  // Query same-groomer appointments that start AFTER the overrunning appointment ends
  // and are ordered by startTime ASC (nearest first)
  const downstreamAppointments = await db
    .select()
    .from(appointments)
    .where(
      and(
        eq(appointments.staffId, groomerId),
        gt(appointments.startTime, overrunning.endTime),
        or(
          eq(appointments.status, "scheduled"),
          eq(appointments.status, "confirmed")
        )
      )
    )
    .orderBy(asc(appointments.startTime));

  // Track which appointments have been processed to avoid double-processing in cascade
  const processedIds = new Set<string>();
  processedIds.add(overrunningAppointmentId);

  let currentOverrunEnd = effectiveEnd;

  for (const downstream of downstreamAppointments) {
    if (processedIds.has(downstream.id)) continue;

    const downstreamBuffer = await resolveBufferMinutesForAppointment(db, downstream);

    // Check if this downstream appointment conflicts with the current overrun end
    const conflictThreshold = new Date(
      currentOverrunEnd.getTime() + downstreamBuffer * 60_000
    );

    if (conflictThreshold <= downstream.startTime) {
      // No conflict — cascade is complete
      break;
    }

    // Conflict detected — need to shift this appointment
    const shiftDeltaMs = conflictThreshold.getTime() - downstream.startTime.getTime();
    const newStartTime = new Date(downstream.startTime.getTime() + shiftDeltaMs);
    const newEndTime = new Date(downstream.endTime.getTime() + shiftDeltaMs);

    // Check business hours (simple: only shift within same calendar day window for now)
    // A more sophisticated implementation would check actual business hours from businessSettings
    const isSameDay =
      newStartTime.toDateString() === downstream.startTime.toDateString();

    if (!isSameDay) {
      result.flaggedForReview.push({
        id: downstream.id,
        reason: `Shifted appointment would fall on a different day (${newStartTime.toDateString()})`,
        requestedStartTime: newStartTime,
        requestedEndTime: newEndTime,
      });
      // Continue cascade check — we still process downstream appointments
      currentOverrunEnd = newEndTime;
      processedIds.add(downstream.id);
      continue;
    }

    // Apply the shift
    await db
      .update(appointments)
      .set({
        startTime: newStartTime,
        endTime: newEndTime,
        updatedAt: new Date(),
      })
      .where(eq(appointments.id, downstream.id));

    result.shifted.push({
      id: downstream.id,
      oldStartTime: downstream.startTime,
      oldEndTime: downstream.endTime,
      newStartTime,
      newEndTime,
      shiftDeltaMs,
    });

    // Update current overrun end for next iteration
    currentOverrunEnd = newEndTime;
    processedIds.add(downstream.id);
  }

  // Send notifications for all shifted appointments
  for (const shifted of result.shifted) {
    await notifyShiftedAppointment(db, shifted);
  }

  return result;
}

/**
 * Determines if an appointment update represents an overrun that triggers cascade logic.
 */
export function isOverrun({
  originalEndTime,
  newEndTime,
  originalStartTime,
  newStartTime,
  status,
  currentTime,
  bufferMinutes,
}: {
  originalEndTime: Date;
  newEndTime: Date;
  originalStartTime: Date;
  newStartTime?: Date;
  status: string;
  currentTime: Date;
  bufferMinutes: number;
}): boolean {
  // Case 1: endTime extended beyond original
  if (newEndTime > originalEndTime) {
    return true;
  }

  // Case 2: status transition where current time exceeds endTime + bufferMinutes
  // This handles cases where an appointment ran long but wasn't explicitly rescheduled
  if (
    (status === "in_progress" || status === "completed") &&
    currentTime > new Date(originalEndTime.getTime() + bufferMinutes * 60_000)
  ) {
    return true;
  }

  return false;
}

async function resolveBufferMinutesForAppointment(
  db: Db,
  appt: AppointmentWithGroomer
): Promise<number> {
  // First check if the appointment has an explicit bufferMinutes override
  if (appt.bufferMinutes > 0) {
    return appt.bufferMinutes;
  }

  // Fall back to buffer time rules based on service + pet characteristics
  const [pet] = await db
    .select({ sizeCategory: pets.sizeCategory, coatType: pets.coatType })
    .from(pets)
    .where(eq(pets.id, appt.petId))
    .limit(1);

  if (!pet) return 0;

  return resolveBufferMinutes({
    serviceId: appt.serviceId,
    sizeCategory: pet.sizeCategory,
    coatType: pet.coatType,
    db,
  });
}

async function notifyShiftedAppointment(
  db: Db,
  shifted: ShiftedAppointment
): Promise<void> {
  const [row] = await db
    .select({
      clientName: clients.name,
      clientEmail: clients.email,
      clientEmailOptOut: clients.emailOptOut,
      petName: pets.name,
      serviceName: services.name,
      groomerName: staff.name,
      appointmentStartTime: appointments.startTime,
    })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(pets, eq(pets.id, appointments.petId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .leftJoin(staff, eq(staff.id, appointments.staffId))
    .where(eq(appointments.id, shifted.id))
    .limit(1);

  if (!row) return;
  const { clientName, clientEmail, clientEmailOptOut, petName, serviceName, groomerName } = row;

  if (!clientEmail || clientEmailOptOut) return;
  if (!petName || !serviceName) return;

  console.log(
    `[cascade] Notifying shift for appointment ${shifted.id}: ` +
      `${shifted.oldStartTime.toISOString()} → ${shifted.newStartTime.toISOString()}`
  );

  await sendEmail(
    buildRescheduleNotificationEmail(clientEmail, {
      clientName,
      petName,
      serviceName,
      groomerName: groomerName ?? null,
      oldStartTime: shifted.oldStartTime,
      newStartTime: shifted.newStartTime,
    })
  );
}