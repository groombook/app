import { and, eq, getDb, waitlistEntries, clients, pets, services } from "@groombook/db";
import { buildWaitlistNotificationEmail, sendEmail } from "./email.js";

export async function notifyWaitlistForAppointment(
  appointmentId: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceId: string
): Promise<void> {
  const db = getDb();

  const matchingEntries = await db
    .select()
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.preferredDate, appointmentDate),
        eq(waitlistEntries.preferredTime, appointmentTime),
        eq(waitlistEntries.serviceId, serviceId),
        eq(waitlistEntries.status, "active")
      )
    );

  for (const entry of matchingEntries) {
    const [client] = await db
      .select({ name: clients.name, email: clients.email, emailOptOut: clients.emailOptOut })
      .from(clients)
      .where(eq(clients.id, entry.clientId))
      .limit(1);

    if (!client?.email || client.emailOptOut) continue;

    const [pet] = await db
      .select({ name: pets.name })
      .from(pets)
      .where(eq(pets.id, entry.petId))
      .limit(1);

    const [service] = await db
      .select({ name: services.name })
      .from(services)
      .where(eq(services.id, entry.serviceId))
      .limit(1);

    if (!pet || !service) continue;

    const email = buildWaitlistNotificationEmail(client.email, {
      clientName: client.name,
      petName: pet.name,
      serviceName: service.name,
      preferredDate: appointmentDate,
      preferredTime: appointmentTime,
    });

    const sent = await sendEmail(email);
    if (sent) {
      await db
        .update(waitlistEntries)
        .set({ status: "notified", notifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(waitlistEntries.id, entry.id));
    }
  }
}
