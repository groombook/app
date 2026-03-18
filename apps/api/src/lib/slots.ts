/**
 * Business hours slot generation — pure utility, no DB dependencies.
 * Extracted so it can be unit tested independently of the route layer.
 */

export const BUSINESS_START_HOUR = 9; // UTC
export const BUSINESS_END_HOUR = 17; // UTC

export interface BookedSlot {
  staffId: string | null;
  startTime: Date;
  endTime: Date;
}

/**
 * Generate all available appointment start times for a given date,
 * returning only slots where at least one groomer is free.
 */
export function generateAvailableSlots({
  dateStr,
  durationMinutes,
  groomerIds,
  booked,
}: {
  dateStr: string;
  durationMinutes: number;
  groomerIds: string[];
  booked: BookedSlot[];
}): string[] {
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  dayStart.setUTCHours(BUSINESS_START_HOUR, 0, 0, 0);
  const dayEnd = new Date(`${dateStr}T00:00:00Z`);
  dayEnd.setUTCHours(BUSINESS_END_HOUR, 0, 0, 0);

  const durationMs = durationMinutes * 60_000;
  const slots: string[] = [];
  let slotStart = dayStart.getTime();

  while (slotStart + durationMs <= dayEnd.getTime()) {
    const slotEnd = slotStart + durationMs;
    const hasGroomer = groomerIds.some(
      (groomerId) =>
        !booked.some(
          (a) =>
            a.staffId === groomerId &&
            a.startTime.getTime() < slotEnd &&
            a.endTime.getTime() > slotStart
        )
    );
    if (hasGroomer) slots.push(new Date(slotStart).toISOString());
    slotStart += durationMs;
  }

  return slots;
}
