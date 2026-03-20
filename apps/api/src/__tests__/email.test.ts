import { describe, it, expect } from "vitest";
import {
  buildConfirmationEmail,
  buildReminderEmail,
} from "../services/email.js";

const START = new Date("2026-03-25T15:00:00Z");

const BASE = {
  clientName: "Jane Doe",
  petName: "Biscuit",
  serviceName: "Full Groom",
  groomerName: "Alex",
  startTime: START,
};

describe("buildConfirmationEmail", () => {
  it("addresses the correct recipient", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.to).toBe("jane@example.com");
  });

  it("includes the pet name in the subject", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.subject).toContain("Biscuit");
  });

  it("includes confirmation wording in subject", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.subject).toMatch(/confirmed/i);
  });

  it("includes client name in the plain text body", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.text).toContain("Jane Doe");
  });

  it("includes service name in plain text body", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.text).toContain("Full Groom");
  });

  it("includes groomer name when provided", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.text).toContain("Alex");
  });

  it("omits groomer when groomerName is null", () => {
    const mail = buildConfirmationEmail("jane@example.com", {
      ...BASE,
      groomerName: null,
    });
    expect(mail.text).not.toContain("with ");
  });

  it("includes HTML body", () => {
    const mail = buildConfirmationEmail("jane@example.com", BASE);
    expect(mail.html).toBeTruthy();
    expect(mail.html).toContain("Biscuit");
  });
});

describe("buildReminderEmail", () => {
  it("addresses the correct recipient", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.to).toBe("jane@example.com");
  });

  it("says 'tomorrow' for 24-hour reminder", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.subject).toContain("tomorrow");
    expect(mail.text).toContain("tomorrow");
  });

  it("says 'in X hours' for sub-24-hour reminders", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 2);
    expect(mail.subject).toContain("in 2 hours");
    expect(mail.text).toContain("in 2 hours");
  });

  it("includes pet name in subject", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.subject).toContain("Biscuit");
  });

  it("includes service name in plain text body", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.text).toContain("Full Groom");
  });

  it("includes groomer name when provided", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.text).toContain("Alex");
  });

  it("omits groomer when groomerName is null", () => {
    const mail = buildReminderEmail("jane@example.com", { ...BASE, groomerName: null }, 24);
    expect(mail.text).not.toContain("with ");
  });

  it("includes HTML body", () => {
    const mail = buildReminderEmail("jane@example.com", BASE, 24);
    expect(mail.html).toBeTruthy();
    expect(mail.html).toContain("Biscuit");
  });
});
