import { describe, it, expect } from "vitest";
import {
  generateAvailableSlots,
  BUSINESS_START_HOUR,
  BUSINESS_END_HOUR,
} from "../lib/slots.js";

const DATE = "2026-03-18";
const G1 = "groomer-1";
const G2 = "groomer-2";

function utc(h: number, m = 0): Date {
  const d = new Date(`${DATE}T00:00:00Z`);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

describe("generateAvailableSlots", () => {
  it("returns slots within business hours", () => {
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1],
      booked: [],
    });
    expect(slots.length).toBeGreaterThan(0);
    slots.forEach((s) => {
      const h = new Date(s).getUTCHours();
      expect(h).toBeGreaterThanOrEqual(BUSINESS_START_HOUR);
      expect(h).toBeLessThan(BUSINESS_END_HOUR);
    });
  });

  it("returns correct count of 60-min slots across 8-hour window", () => {
    // 09:00–17:00 = 8 hours → 8 one-hour slots
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1],
      booked: [],
    });
    expect(slots).toHaveLength(8);
  });

  it("returns empty array when no groomers", () => {
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [],
      booked: [],
    });
    expect(slots).toHaveLength(0);
  });

  it("excludes slots blocked by a booking", () => {
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1],
      booked: [{ staffId: G1, startTime: utc(9), endTime: utc(10) }],
    });
    expect(slots).not.toContain(new Date(`${DATE}T09:00:00.000Z`).toISOString());
    expect(slots).toContain(new Date(`${DATE}T10:00:00.000Z`).toISOString());
  });

  it("keeps slot available when only the other groomer is booked", () => {
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1, G2],
      booked: [{ staffId: G1, startTime: utc(9), endTime: utc(10) }],
    });
    // G2 is free at 09:00 so slot should still appear
    expect(slots).toContain(new Date(`${DATE}T09:00:00.000Z`).toISOString());
  });

  it("excludes a slot only when ALL groomers are booked", () => {
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1, G2],
      booked: [
        { staffId: G1, startTime: utc(9), endTime: utc(10) },
        { staffId: G2, startTime: utc(9), endTime: utc(10) },
      ],
    });
    expect(slots).not.toContain(new Date(`${DATE}T09:00:00.000Z`).toISOString());
  });

  it("correctly handles a booking that partially overlaps a slot", () => {
    // Booking 09:30–10:30 should block the 09:00 and 10:00 slots for G1
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 60,
      groomerIds: [G1],
      booked: [{ staffId: G1, startTime: utc(9, 30), endTime: utc(10, 30) }],
    });
    expect(slots).not.toContain(new Date(`${DATE}T09:00:00.000Z`).toISOString());
    expect(slots).not.toContain(new Date(`${DATE}T10:00:00.000Z`).toISOString());
    expect(slots).toContain(new Date(`${DATE}T11:00:00.000Z`).toISOString());
  });

  it("does not generate a slot that would exceed business hours end", () => {
    // 30-min slots: last valid start is 16:30 (ends at 17:00)
    const slots = generateAvailableSlots({
      dateStr: DATE,
      durationMinutes: 30,
      groomerIds: [G1],
      booked: [],
    });
    const last = slots[slots.length - 1];
    expect(last).toBeDefined();
    expect(new Date(last!).getUTCHours()).toBe(16);
    expect(new Date(last!).getUTCMinutes()).toBe(30);
  });
});
