import { describe, it, expect, vi, beforeEach } from "vitest";
import { cascadeDelay } from "../cascade.js";

// ─── Mock the DB ───────────────────────────────────────────────────────────────

const mockDb = {
  select: vi.fn(),
  update: vi.fn(),
};

vi.mock("@groombook/db", () => ({
  getDb: () => mockDb,
  appointments: {
    id: Symbol("id"),
    staffId: Symbol("staffId"),
    startTime: Symbol("startTime"),
    endTime: Symbol("endTime"),
    status: Symbol("status"),
  },
  clients: { id: Symbol("id"), name: Symbol("name"), email: Symbol("email") },
  pets: { id: Symbol("id"), name: Symbol("name") },
  services: { id: Symbol("id"), name: Symbol("name") },
  staff: { id: Symbol("id"), name: Symbol("name") },
  eq: (a: symbol, b: unknown) => ({ type: "eq", a, b }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  gt: (a: symbol, b: unknown) => ({ type: "gt", a, b }),
  inArray: (a: symbol, vals: unknown[]) => ({ type: "inArray", a, vals }),
  asc: (a: symbol) => ({ type: "asc", a }),
}));

vi.mock("../services/email.js", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

const { sendEmail } = await import("../services/email.js");
const { getDb } = await import("@groombook/db");

// ─── Helpers ────────────────────────────────────────────────────────────────────

function makeAppt(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "appt-1",
    staffId: "groomer-1",
    startTime: new Date("2026-05-16T10:00:00Z"),
    endTime: new Date("2026-05-16T11:00:00Z"),
    status: "scheduled",
    clientId: "client-1",
    petId: "pet-1",
    serviceId: "svc-1",
    ...overrides,
  };
}

function makeEnrichedAppt(id: string, start: Date, end: Date) {
  return {
    id,
    originalStartTime: start,
    originalEndTime: end,
    newStartTime: start,
    newEndTime: end,
    clientId: "client-1",
    clientName: "Alice Smith",
    clientEmail: "alice@example.com",
    petName: "Buddy",
    serviceName: "Full Groom",
    groomerName: "Jamie",
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("cascadeDelay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when the triggering appointment is not found", async () => {
    mockDb.select.mockResolvedValueOnce([]);

    const result = await cascadeDelay(
      "nonexistent",
      new Date("2026-05-16T12:00:00Z"),
      new Date("2026-05-16T11:00:00Z")
    );

    expect(result.shifted).toHaveLength(0);
    expect(result.flaggedForReview).toHaveLength(0);
  });

  it("returns early when the appointment has no groomer assigned", async () => {
    mockDb.select.mockResolvedValueOnce([{ ...makeAppt(), staffId: null }]);

    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T12:00:00Z"),
      new Date("2026-05-16T11:00:00Z")
    );

    expect(result.shifted).toHaveLength(0);
  });

  it("returns early when newEndTime does not extend beyond originalEndTime", async () => {
    mockDb.select.mockResolvedValueOnce([makeAppt()]);

    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T11:30:00Z"), // earlier than original 11:00
      new Date("2026-05-16T11:00:00Z")
    );

    expect(result.shifted).toHaveLength(0);
  });

  it("returns early when there are no downstream appointments", async () => {
    mockDb.select
      .mockResolvedValueOnce([makeAppt()])           // triggering appt
      .mockResolvedValueOnce([]);                     // no downstream

    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T11:30:00Z"),
      new Date("2026-05-16T11:00:00Z")
    );

    expect(result.shifted).toHaveLength(0);
  });

  it("shifts a single downstream appointment by the correct delta", async () => {
    const triggerEnd = new Date("2026-05-16T11:30:00Z"); // 30 min overrun
    const originalEnd = new Date("2026-05-16T11:00:00Z");
    const downstreamStart = new Date("2026-05-16T11:00:00Z");
    const downstreamEnd = new Date("2026-05-16T12:00:00Z");

    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        makeAppt({
          id: "downstream-1",
          startTime: downstreamStart,
          endTime: downstreamEnd,
          status: "scheduled",
        }),
      ]);

    const updateMock = mockDb.update.mockReturnValueThis();
    mockDb.select.mockResolvedValueOnce([
      {
        clientId: "client-1",
        clientName: "Alice",
        clientEmail: "alice@example.com",
        petName: "Buddy",
        serviceName: "Full Groom",
        groomerName: "Jamie",
      },
    ]);

    const result = await cascadeDelay(
      "appt-trigger",
      triggerEnd,
      originalEnd,
      15 // 15 min buffer
    );

    // effectiveBoundary = 11:30 + 15min = 11:45
    // delta = 11:45 - 11:00 = 45 min = 2_700_000 ms
    const expectedDeltaMs = 45 * 60 * 1000;

    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].id).toBe("downstream-1");
    expect(result.shifted[0].newStartTime.getTime() - result.shifted[0].originalStartTime.getTime())
      .toBe(expectedDeltaMs);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("cascades shifts through a chain of appointments", async () => {
    const triggerEnd = new Date("2026-05-16T12:00:00Z"); // 60 min overrun
    const originalEnd = new Date("2026-05-16T11:00:00Z");

    // Three downstream appointments, each 1 hour
    const appt1Start = new Date("2026-05-16T11:00:00Z");
    const appt1End   = new Date("2026-05-16T12:00:00Z");
    const appt2Start = new Date("2026-05-16T12:00:00Z");
    const appt2End   = new Date("2026-05-16T13:00:00Z");
    const appt3Start = new Date("2026-05-16T13:00:00Z");
    const appt3End   = new Date("2026-05-16T14:00:00Z");

    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        makeAppt({ id: "appt-2", startTime: appt2Start, endTime: appt2End, status: "confirmed" }),
        makeAppt({ id: "appt-3", startTime: appt3Start, endTime: appt3End, status: "scheduled" }),
      ]);

    mockDb.update.mockReturnValueThis();

    // Two enrich queries for the two shifted appointments
    mockDb.select
      .mockResolvedValueOnce([
        {
          clientId: "c1", clientName: "Alice", clientEmail: "alice@test.com",
          petName: "Buddy", serviceName: "Full Groom", groomerName: "Jamie",
        },
      ])
      .mockResolvedValueOnce([
        {
          clientId: "c2", clientName: "Bob", clientEmail: "bob@test.com",
          petName: "Max", serviceName: "Bath", groomerName: "Jamie",
        },
      ]);

    const result = await cascadeDelay(
      "appt-trigger",
      triggerEnd,
      originalEnd,
      15
    );

    // effectiveBoundary starts at 12:00 + 15 = 12:15
    // appt-2: 12:00 start conflicts with 12:15 boundary → shift by 15 min → starts 12:15, ends 13:15
    // new boundary: 13:15 + 15 = 13:30
    // appt-3: 13:00 start conflicts with 13:30 boundary → shift by 30 min → starts 13:30, ends 14:30
    expect(result.shifted).toHaveLength(2);
    expect(result.shifted[0].id).toBe("appt-2");
    expect(result.shifted[1].id).toBe("appt-3");
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("flags but still updates boundary when shift would fall outside business hours", async () => {
    const triggerEnd = new Date("2026-05-16T17:00:00Z");
    const originalEnd = new Date("2026-05-16T16:00:00Z");

    // Downstream appt starts at 16:00, business ends at 18:00
    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        makeAppt({
          id: "appt-late",
          startTime: new Date("2026-05-16T16:00:00Z"),
          endTime:   new Date("2026-05-16T17:00:00Z"),
          status: "scheduled",
        }),
      ]);

    mockDb.update.mockReturnValueThis();
    mockDb.select.mockResolvedValueOnce([
      {
        clientId: "c1", clientName: "Alice", clientEmail: "alice@test.com",
        petName: "Buddy", serviceName: "Full Groom", groomerName: "Jamie",
      },
    ]);

    // Business hours 08:00–18:00; proposed shift pushes to 17:15 start (still in hours)
    // Try a late-night boundary: shift would push to 19:15 (outside 08:00–18:00)
    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T18:00:00Z"), // larger overrun
      originalEnd,
      15,
      8,  // business start
      18  // business end — proposed 18:15 start is outside
    );

    // The appointment at 16:00 with buffer of 15 min after 18:00 trigger:
    // effectiveBoundary = 18:00 + 15 = 18:15 → outside business hours (18:15 > 18:00)
    expect(result.flaggedForReview).toHaveLength(1);
    expect(result.flaggedForReview[0].id).toBe("appt-late");
    expect(result.flaggedForReview[0].reason).toContain("Manual review required");
    // The appointment was NOT shifted (only flagged)
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("skips non-active appointments", async () => {
    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        makeAppt({ id: "in-progress-1", status: "in_progress" }),
        makeAppt({ id: "cancelled-1",  status: "cancelled" }),
        makeAppt({ id: "scheduled-1",  status: "scheduled" }),
      ]);

    mockDb.update.mockReturnValueThis();
    mockDb.select.mockResolvedValueOnce([
      {
        clientId: "c1", clientName: "Alice", clientEmail: "alice@test.com",
        petName: "Buddy", serviceName: "Full Groom", groomerName: "Jamie",
      },
    ]);

    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T11:30:00Z"),
      new Date("2026-05-16T11:00:00Z"),
      15
    );

    // Only the scheduled appointment should be shifted
    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].id).toBe("scheduled-1");
  });

  it("stops cascading when an appointment no longer conflicts", async () => {
    // Three downstream: appt-2 overlaps, appt-3 does NOT overlap, appt-4 overlaps
    // Cascade should stop at appt-3
    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        // appt-2: starts at 11:00, ends 12:00 — overlaps boundary 11:45
        makeAppt({ id: "appt-2", startTime: new Date("2026-05-16T11:00:00Z"), endTime: new Date("2026-05-16T12:00:00Z") }),
        // appt-3: starts at 13:00 — already clear of shifted appt-2 (ends 12:15 + buffer)
        makeAppt({ id: "appt-3", startTime: new Date("2026-05-16T13:00:00Z"), endTime: new Date("2026-05-16T14:00:00Z") }),
        makeAppt({ id: "appt-4", startTime: new Date("2026-05-16T14:00:00Z"), endTime: new Date("2026-05-16T15:00:00Z") }),
      ]);

    mockDb.update.mockReturnValueThis();
    mockDb.select.mockResolvedValueOnce([
      {
        clientId: "c1", clientName: "Alice", clientEmail: "alice@test.com",
        petName: "Buddy", serviceName: "Full Groom", groomerName: "Jamie",
      },
    ]);

    const result = await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T11:30:00Z"),
      new Date("2026-05-16T11:00:00Z"),
      15
    );

    // Only appt-2 was shifted (appt-3 no longer conflicts after the stop condition check)
    expect(result.shifted).toHaveLength(1);
    expect(result.shifted[0].id).toBe("appt-2");
  });

  it("sends email notification for each shifted appointment", async () => {
    mockDb.select
      .mockResolvedValueOnce([makeAppt({ staffId: "groomer-1" })])
      .mockResolvedValueOnce([
        makeAppt({
          id: "appt-email-test",
          startTime: new Date("2026-05-16T11:00:00Z"),
          endTime: new Date("2026-05-16T12:00:00Z"),
          status: "confirmed",
        }),
      ]);

    mockDb.update.mockReturnValueThis();
    mockDb.select.mockResolvedValueOnce([
      {
        clientId: "c1",
        clientName: "Carol",
        clientEmail: "carol@example.com",
        petName: "Luna",
        serviceName: "Nail Trim",
        groomerName: null,
      },
    ]);

    await cascadeDelay(
      "appt-trigger",
      new Date("2026-05-16T11:30:00Z"),
      new Date("2026-05-16T11:00:00Z"),
      15
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "carol@example.com",
        subject: expect.stringContaining("Rescheduled"),
      })
    );
  });
});