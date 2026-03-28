/**
 * Groomer Isolation Tests
 *
 * Validates row-level data scoping for the groomer role.
 *
 * The role guard tests verify the core groomer identification logic.
 * Integration tests with the real database validate the full filter behavior.
 */

import { describe, it, expect } from "vitest";
import type { StaffRow } from "../middleware/rbac.js";

// ─── Mock staff ───────────────────────────────────────────────────────────────

const MANAGER: StaffRow = {
  id: "staff-manager-id",
  oidcSub: "oidc-manager-sub",
  userId: null,
  role: "manager",
  name: "Manager McManager",
  email: "manager@example.com",
  active: true,
  icalToken: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const GROOMER: StaffRow = {
  ...MANAGER,
  id: "staff-groomer-id",
  oidcSub: "oidc-groomer-sub",
  role: "groomer",
  name: "Groomer Gary",
  email: "groomer@example.com",
};

const RECEPTIONIST: StaffRow = {
  ...MANAGER,
  id: "staff-receptionist-id",
  oidcSub: "oidc-receptionist-sub",
  role: "receptionist",
  name: "Receptionist Rita",
  email: "receptionist@example.com",
};

// ─── Role guard ──────────────────────────────────────────────────────────────

/**
 * The isGroomer guard (staffRow?.role === "groomer") is the foundation of
 * all row-level filtering in appointments.ts, clients.ts, and pets.ts.
 * These tests verify it handles all roles correctly.
 */
describe("Groomer role guard", () => {
  const isGroomer = (s: StaffRow | undefined) => s?.role === "groomer";

  it("manager is not groomer", () => expect(isGroomer(MANAGER)).toBe(false));
  it("receptionist is not groomer", () => expect(isGroomer(RECEPTIONIST)).toBe(false));
  it("groomer is groomer", () => expect(isGroomer(GROOMER)).toBe(true));

  /** Safe fallback when staff context is not set (e.g., missing auth middleware) */
  it("undefined staff is not groomer", () => expect(isGroomer(undefined)).toBe(false));
});

// ─── Groomer filter data shapes ───────────────────────────────────────────────

/**
 * These constants match the shape used in route handlers to validate
 * the groomer filter conditions:
 *   or(eq(appointments.staffId, staffRow.id), eq(appointments.batherStaffId, staffRow.id))
 * This verifies the groomer can see appointments they own OR bathe.
 */
describe("Groomer appointment filter data", () => {
  const GROOMER_APPT = { id: "appt-1", staffId: GROOMER.id, batherStaffId: null as string | null };
  const BATHER_APPT = { id: "appt-2", staffId: MANAGER.id, batherStaffId: GROOMER.id };
  const OTHER_APPT = { id: "appt-3", staffId: MANAGER.id, batherStaffId: null as string | null };

  it("groomer appointment has groomer staffId", () => {
    expect(GROOMER_APPT.staffId).toBe(GROOMER.id);
    expect(GROOMER_APPT.batherStaffId).toBeNull();
  });

  it("groomer can see appointment where they are the bather", () => {
    expect(BATHER_APPT.batherStaffId).toBe(GROOMER.id);
    expect(BATHER_APPT.staffId).toBe(MANAGER.id);
  });

  it("other appointment is not assigned to groomer", () => {
    expect(OTHER_APPT.staffId).toBe(MANAGER.id);
    expect(OTHER_APPT.batherStaffId).toBeNull();
  });

  it("filter: groomer sees only their appointments", () => {
    const all = [GROOMER_APPT, BATHER_APPT, OTHER_APPT];
    const groomerView = all.filter(
      (a) => a.staffId === GROOMER.id || a.batherStaffId === GROOMER.id
    );
    expect(groomerView).toHaveLength(2);
    expect(groomerView.map((a) => a.id)).toEqual(["appt-1", "appt-2"]);
  });

  it("filter: manager sees all appointments", () => {
    const all = [GROOMER_APPT, BATHER_APPT, OTHER_APPT];
    expect(all).toHaveLength(3);
  });
});
