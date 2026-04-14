import { Hono } from "hono";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  and,
  eq,
  gte,
  getDb,
  appointments,
  clients,
  pets,
  services,
  staff,
} from "@groombook/db";

export const calendarRouter = new Hono();

function formatIcalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcalText(text: string | null): string {
  if (!text) return "";
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildIcalFeed(
  appointments: Array<{
    id: string;
    startTime: Date;
    endTime: Date;
    status: string;
    clientName: string | null;
    petName: string | null;
    serviceName: string | null;
  }>,
  staffName: string,
  dtstamp: string
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GroomBook//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcalText(staffName)} - GroomBook`,
  ];

  for (const appt of appointments) {
    const status = appt.status === "cancelled" ? "CANCELLED" : "CONFIRMED";
    const sequence = appt.status === "cancelled" ? "1" : "0";
    const summary = `${appt.petName ?? "Pet"} - ${appt.serviceName ?? "Appointment"}`;
    const description = `Client: ${appt.clientName ?? "Unknown"}\nPet: ${appt.petName ?? "Unknown"}\nService: ${appt.serviceName ?? "Unknown"}`;

    lines.push(
      "BEGIN:VEVENT",
      `UID:${appt.id}@groombook`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${formatIcalDate(new Date(appt.startTime))}`,
      `DTEND:${formatIcalDate(new Date(appt.endTime))}`,
      `SUMMARY:${escapeIcalText(summary)}`,
      `DESCRIPTION:${escapeIcalText(description)}`,
      `STATUS:${status}`,
      `SEQUENCE:${sequence}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

calendarRouter.get("/:staffId.ics", async (c) => {
  const db = getDb();
  const staffId = c.req.param("staffId") as string;
  const token = c.req.query("token") as string;

  if (!token) {
    return c.text("Unauthorized", 401);
  }

  const [staffMember] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, staffId))
    .limit(1);

  if (
    !staffMember ||
    !staffMember.icalToken ||
    staffMember.icalToken.length !== token.length ||
    !timingSafeEqual(Buffer.from(staffMember.icalToken), Buffer.from(token))
  ) {
    return c.text("Unauthorized", 401);
  }

  const now = new Date();
  const rows = await db
    .select({
      id: appointments.id,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      status: appointments.status,
      clientId: appointments.clientId,
      petId: appointments.petId,
      serviceId: appointments.serviceId,
      clientName: clients.name,
      petName: pets.name,
      serviceName: services.name,
    })
    .from(appointments)
    .innerJoin(clients, eq(appointments.clientId, clients.id))
    .innerJoin(pets, eq(appointments.petId, pets.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .where(
      and(
        eq(appointments.staffId, staffId),
        gte(appointments.startTime, now)
      )
    )
    .orderBy(appointments.startTime);

  const ical = buildIcalFeed(rows, staffMember.name, formatIcalDate(new Date()));
  return c.text(ical, 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="${encodeURIComponent(staffMember.name)}_calendar.ics"`,
  });
});

export function generateIcalToken(): string {
  return randomBytes(32).toString("hex");
}
