import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveBufferMinutes } from "../lib/buffer.js";

// ─── Mock types matching schema ─────────────────────────────────────────────

interface MockBufferTimeRule {
  id: string;
  serviceId: string;
  sizeCategory: string | null;
  coatType: string | null;
  bufferMinutes: number;
}

interface MockService {
  id: string;
  name: string;
  defaultBufferMinutes: number;
}

// ─── Mock db factory ─────────────────────────────────────────────────────────
// Simulates Drizzle query builder: db.select().from(t).where(eq(...)) → await → array
// For services we use db.select().from(t).where(eq(...)).limit(1) → await → first item

function createMockDb(rules: MockBufferTimeRule[], services: MockService[]) {
  let callCount = 0;

  return {
    select: vi.fn(() => {
      callCount++;
      const rulesQuery = {
        from: () => ({
          where: () => rules, // await resolves directly to rules array
        }),
      };
      const serviceQuery = {
        from: () => ({
          where: () => ({
            limit: () => services, // await resolves to services array
          }),
        }),
      };
      // First select call → rules, second → services
      return callCount === 1 ? rulesQuery : serviceQuery;
    }),
  } as any;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("resolveBufferMinutes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns exact match when serviceId + sizeCategory + coatType all match", async () => {
    const db = createMockDb(
      [
        { id: "rule-1", serviceId: "svc-1", sizeCategory: "medium", coatType: "short", bufferMinutes: 15 },
        { id: "rule-2", serviceId: "svc-1", sizeCategory: "medium", coatType: null, bufferMinutes: 10 },
        { id: "rule-3", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 5 },
      ],
      []
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "medium",
      coatType: "short",
      db,
    });

    expect(result).toBe(15);
  });

  it("returns service + size match when no exact match", async () => {
    const db = createMockDb(
      [
        { id: "rule-1", serviceId: "svc-1", sizeCategory: "medium", coatType: null, bufferMinutes: 10 },
        { id: "rule-2", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 5 },
      ],
      []
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "medium",
      coatType: "long",
      db,
    });

    expect(result).toBe(10);
  });

  it("returns service + coat match when no exact or size match", async () => {
    const db = createMockDb(
      [
        { id: "rule-1", serviceId: "svc-1", sizeCategory: null, coatType: "wire", bufferMinutes: 12 },
        { id: "rule-2", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 5 },
      ],
      []
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "large",
      coatType: "wire",
      db,
    });

    expect(result).toBe(12);
  });

  it("returns service-only match when no partial matches", async () => {
    const db = createMockDb(
      [{ id: "rule-1", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 7 }],
      []
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "large",
      coatType: "long",
      db,
    });

    expect(result).toBe(7);
  });

  it("falls back to service.defaultBufferMinutes when no rules exist", async () => {
    const db = createMockDb([], [{ id: "svc-1", name: "Bath", defaultBufferMinutes: 8 }]);

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "small",
      coatType: "curly",
      db,
    });

    expect(result).toBe(8);
  });

  it("falls back to 0 when no rules and no service default", async () => {
    const db = createMockDb([], []);

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "small",
      coatType: null,
      db,
    });

    expect(result).toBe(0);
  });

  it("exact match beats partial matches (priority verification)", async () => {
    const db = createMockDb(
      [
        { id: "rule-1", serviceId: "svc-1", sizeCategory: "medium", coatType: "short", bufferMinutes: 20 },
        { id: "rule-2", serviceId: "svc-1", sizeCategory: "medium", coatType: null, bufferMinutes: 15 },
        { id: "rule-3", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 10 },
      ],
      [{ id: "svc-1", name: "Groom", defaultBufferMinutes: 5 }]
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "medium",
      coatType: "short",
      db,
    });

    // Exact match (20) should win over service+size (15) and service default (5)
    expect(result).toBe(20);
  });

  it("handles null sizeCategory and null coatType at rule level", async () => {
    const db = createMockDb(
      [{ id: "rule-1", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 6 }],
      []
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: null,
      coatType: null,
      db,
    });

    expect(result).toBe(6);
  });

  it("prefers service+size over service-only when both exist", async () => {
    const db = createMockDb(
      [
        { id: "rule-1", serviceId: "svc-1", sizeCategory: "large", coatType: null, bufferMinutes: 14 },
        { id: "rule-2", serviceId: "svc-1", sizeCategory: null, coatType: null, bufferMinutes: 3 },
      ],
      [{ id: "svc-1", name: "Groom", defaultBufferMinutes: 1 }]
    );

    const result = await resolveBufferMinutes({
      serviceId: "svc-1",
      sizeCategory: "large",
      coatType: "smooth",
      db,
    });

    expect(result).toBe(14);
  });
});