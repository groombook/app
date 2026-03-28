/**
 * Test factories — build typed in-memory entities for unit tests.
 *
 * Each factory returns a fully-populated object with valid defaults.
 * Pass an overrides object to customise specific fields.
 *
 * IDs are generated with a deterministic counter so tests produce stable,
 * readable values (e.g. "staff-1", "client-2") without needing crypto.
 *
 * Usage:
 *   import { buildStaff, buildClient, buildPet } from "@groombook/db/factories";
 *
 *   const manager = buildStaff({ role: "manager" });
 *   const client  = buildClient({ name: "Alice Smith" });
 *   const pet     = buildPet({ clientId: client.id });
 */

import type { staff, clients, pets, services, appointments } from "./schema.js";

// ── Counter-based ID factory ─────────────────────────────────────────────────

const counters: Record<string, number> = {};

function nextId(prefix: string): string {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}-${counters[prefix]}`;
}

/** Reset all counters. Call in beforeEach() to keep tests independent. */
export function resetFactoryCounters(): void {
  for (const key of Object.keys(counters)) {
    delete counters[key];
  }
}

// ── Type aliases ─────────────────────────────────────────────────────────────

export type StaffRow        = typeof staff.$inferSelect;
export type ClientRow       = typeof clients.$inferSelect;
export type PetRow          = typeof pets.$inferSelect;
export type ServiceRow      = typeof services.$inferSelect;
export type AppointmentRow  = typeof appointments.$inferSelect;

// ── Factories ────────────────────────────────────────────────────────────────

export function buildStaff(overrides: Partial<StaffRow> = {}): StaffRow {
  const id = nextId("staff");
  return {
    id,
    name: `Staff Member ${id}`,
    email: `${id}@groombook.test`,
    oidcSub: `oidc-${id}`,
    userId: null,
    role: "groomer",
    active: true,
    icalToken: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function buildClient(overrides: Partial<ClientRow> = {}): ClientRow {
  const id = nextId("client");
  return {
    id,
    name: `Client ${id}`,
    email: `${id}@example.com`,
    phone: "555-0100",
    address: "1 Main St, Springfield, CA 90000",
    notes: null,
    emailOptOut: false,
    status: "active",
    disabledAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function buildPet(overrides: Partial<PetRow> & { clientId: string }): PetRow {
  const id = nextId("pet");
  const defaults: PetRow = {
    id,
    clientId: overrides.clientId,
    name: `Pet ${id}`,
    species: "Dog",
    breed: "Mixed Breed",
    weightKg: "15.00",
    dateOfBirth: new Date("2020-06-15T00:00:00Z"),
    healthAlerts: null,
    groomingNotes: null,
    cutStyle: null,
    shampooPreference: null,
    specialCareNotes: null,
    customFields: {},
    photoKey: null,
    photoUploadedAt: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
  };
  return { ...defaults, ...overrides };
}

export function buildService(overrides: Partial<ServiceRow> = {}): ServiceRow {
  const id = nextId("service");
  return {
    id,
    name: `Service ${id}`,
    description: "A grooming service",
    basePriceCents: 6500,
    durationMinutes: 60,
    active: true,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
    ...overrides,
  };
}

export function buildAppointment(
  overrides: Partial<AppointmentRow> & { clientId: string; petId: string; serviceId: string; staffId: string }
): AppointmentRow {
  const id = nextId("appointment");
  const startTime = new Date("2025-06-01T10:00:00Z");
  const endTime = new Date("2025-06-01T11:00:00Z");
  const defaults: AppointmentRow = {
    id,
    clientId: overrides.clientId,
    petId: overrides.petId,
    serviceId: overrides.serviceId,
    staffId: overrides.staffId,
    batherStaffId: null,
    seriesId: null,
    seriesIndex: null,
    groupId: null,
    status: "scheduled",
    startTime,
    endTime,
    notes: null,
    priceCents: null,
    confirmationStatus: "pending",
    confirmedAt: null,
    cancelledAt: null,
    confirmationToken: null,
    customerNotes: null,
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date("2025-01-01T00:00:00Z"),
  };
  return { ...defaults, ...overrides };
}
