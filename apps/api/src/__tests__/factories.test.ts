import { describe, it, expect, beforeEach } from "vitest";
import {
  resetFactoryCounters,
  buildStaff,
  buildClient,
  buildPet,
  buildService,
  buildAppointment,
} from "@groombook/db/factories";

describe("resetFactoryCounters", () => {
  it("resets all counters so IDs restart from 1", () => {
    buildStaff();
    buildStaff();
    buildClient();
    resetFactoryCounters();

    const staff = buildStaff();
    const client = buildClient();

    expect(staff.id).toBe("staff-1");
    expect(client.id).toBe("client-1");
  });

  it("resets counters for every entity type", () => {
    const client = buildClient();
    const pet = buildPet({ clientId: client.id });
    const service = buildService();
    buildAppointment({
      clientId: client.id,
      petId: pet.id,
      serviceId: service.id,
      staffId: "staff-1",
    });

    resetFactoryCounters();

    expect(buildStaff().id).toBe("staff-1");
    expect(buildClient().id).toBe("client-1");
    expect(buildService().id).toBe("service-1");
    const c = buildClient();
    expect(buildPet({ clientId: c.id }).id).toBe("pet-1");
    const s = buildService();
    const p = buildPet({ clientId: c.id });
    expect(
      buildAppointment({ clientId: c.id, petId: p.id, serviceId: s.id, staffId: "s-1" }).id
    ).toBe("appointment-1");
  });
});

describe("counter determinism", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  it("increments staff IDs sequentially", () => {
    expect(buildStaff().id).toBe("staff-1");
    expect(buildStaff().id).toBe("staff-2");
    expect(buildStaff().id).toBe("staff-3");
  });

  it("increments client IDs sequentially", () => {
    expect(buildClient().id).toBe("client-1");
    expect(buildClient().id).toBe("client-2");
  });

  it("increments pet IDs sequentially", () => {
    const client = buildClient();
    expect(buildPet({ clientId: client.id }).id).toBe("pet-1");
    expect(buildPet({ clientId: client.id }).id).toBe("pet-2");
  });

  it("increments service IDs sequentially", () => {
    expect(buildService().id).toBe("service-1");
    expect(buildService().id).toBe("service-2");
  });

  it("increments appointment IDs sequentially", () => {
    const client = buildClient();
    const pet = buildPet({ clientId: client.id });
    const service = buildService();
    const required = { clientId: client.id, petId: pet.id, serviceId: service.id, staffId: "staff-1" };

    expect(buildAppointment(required).id).toBe("appointment-1");
    expect(buildAppointment(required).id).toBe("appointment-2");
  });

  it("each entity type maintains its own independent counter", () => {
    buildStaff();
    buildStaff();
    buildClient();

    // staff counter is at 2; client counter is at 1
    expect(buildStaff().id).toBe("staff-3");
    expect(buildClient().id).toBe("client-2");
  });
});

describe("override merging", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  it("buildStaff applies overrides over defaults", () => {
    const staff = buildStaff({ role: "manager", name: "Boss" });

    expect(staff.role).toBe("manager");
    expect(staff.name).toBe("Boss");
    expect(staff.id).toBe("staff-1");
    expect(staff.active).toBe(true); // default preserved
  });

  it("buildStaff id override is respected without disrupting the counter", () => {
    const staff = buildStaff({ id: "custom-id" });

    expect(staff.id).toBe("custom-id");
    // counter still ticked — next call gets staff-2
    expect(buildStaff().id).toBe("staff-2");
  });

  it("buildClient applies overrides over defaults", () => {
    const client = buildClient({ name: "Alice Smith", emailOptOut: true });

    expect(client.name).toBe("Alice Smith");
    expect(client.emailOptOut).toBe(true);
    expect(client.status).toBe("active"); // default preserved
  });

  it("buildPet merges overrides and sets clientId from required arg", () => {
    const pet = buildPet({ clientId: "client-99", name: "Fluffy", breed: "Poodle" });

    expect(pet.clientId).toBe("client-99");
    expect(pet.name).toBe("Fluffy");
    expect(pet.breed).toBe("Poodle");
    expect(pet.species).toBe("Dog"); // default preserved
  });

  it("buildService applies overrides over defaults", () => {
    const service = buildService({ basePriceCents: 9900, active: false });

    expect(service.basePriceCents).toBe(9900);
    expect(service.active).toBe(false);
    expect(service.durationMinutes).toBe(60); // default preserved
  });

  it("buildAppointment applies overrides over defaults", () => {
    const client = buildClient();
    const pet = buildPet({ clientId: client.id });
    const service = buildService();
    const appt = buildAppointment({
      clientId: client.id,
      petId: pet.id,
      serviceId: service.id,
      staffId: "staff-1",
      status: "confirmed",
      notes: "allergic to lavender",
    });

    expect(appt.status).toBe("confirmed");
    expect(appt.notes).toBe("allergic to lavender");
    expect(appt.clientId).toBe(client.id);
    expect(appt.petId).toBe(pet.id);
    // defaults preserved
    expect(appt.batherStaffId).toBeNull();
    expect(appt.priceCents).toBeNull();
  });
});

describe("buildAppointment required fields", () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  it("produces a fully-populated AppointmentRow", () => {
    const client = buildClient();
    const pet = buildPet({ clientId: client.id });
    const service = buildService();
    const appt = buildAppointment({
      clientId: client.id,
      petId: pet.id,
      serviceId: service.id,
      staffId: "staff-1",
    });

    expect(appt.id).toBeDefined();
    expect(appt.clientId).toBe(client.id);
    expect(appt.petId).toBe(pet.id);
    expect(appt.serviceId).toBe(service.id);
    expect(appt.staffId).toBe("staff-1");
    expect(appt.startTime).toBeInstanceOf(Date);
    expect(appt.endTime).toBeInstanceOf(Date);
    expect(appt.status).toBe("scheduled");
    expect(appt.batherStaffId).toBeNull();
    expect(appt.seriesId).toBeNull();
    expect(appt.seriesIndex).toBeNull();
    expect(appt.groupId).toBeNull();
    expect(appt.notes).toBeNull();
    expect(appt.priceCents).toBeNull();
    expect(appt.createdAt).toBeInstanceOf(Date);
    expect(appt.updatedAt).toBeInstanceOf(Date);
  });

  // TypeScript compile-time enforcement: omitting any required field produces a type error.
  // The overrides parameter type is `Partial<AppointmentRow> & { clientId: string; petId: string; serviceId: string; staffId: string }`.
  // The test below verifies the type signature is correct by using @ts-expect-error.
  it("type error when required fields are missing — compile-time enforcement", () => {
    // @ts-expect-error clientId is required
    buildAppointment({ petId: "p", serviceId: "s", staffId: "st" });
    // @ts-expect-error petId is required
    buildAppointment({ clientId: "c", serviceId: "s", staffId: "st" });
    // @ts-expect-error serviceId is required
    buildAppointment({ clientId: "c", petId: "p", staffId: "st" });
    // @ts-expect-error staffId is required
    buildAppointment({ clientId: "c", petId: "p", serviceId: "s" });
  });
});
