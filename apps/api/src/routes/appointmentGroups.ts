import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  and,
  eq,
  getDb,
  gte,
  lt,
  lte,
  ne,
  appointmentGroups,
  appointments,
  clients,
  pets,
  services,
  staff,
} from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const appointmentGroupsRouter = new Hono<AppEnv>();

// ─── Schemas ──────────────────────────────────────────────────────────────────

const petAppointmentSchema = z.object({
  petId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  // Each pet may have a different end time (e.g. small dog done faster)
  endTime: z.string().datetime(),
  priceCents: z.number().int().positive().optional(),
});

const createGroupSchema = z.object({
  clientId: z.string().uuid(),
  startTime: z.string().datetime(),
  // One entry per pet
  pets: z.array(petAppointmentSchema).min(2, "A group booking requires at least 2 pets"),
  notes: z.string().max(2000).optional(),
});

const updateGroupSchema = z.object({
  notes: z.string().max(2000).nullable().optional(),
});

// ─── List groups (compact, with appointment count and start time) ─────────────

appointmentGroupsRouter.get("/", async (c) => {
  const db = getDb();
  const clientId = c.req.query("clientId");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  const groupConditions = clientId
    ? [eq(appointmentGroups.clientId, clientId)]
    : [];

  const groups = await db
    .select()
    .from(appointmentGroups)
    .where(groupConditions.length > 0 ? and(...groupConditions) : undefined)
    .orderBy(appointmentGroups.createdAt);

  if (groups.length === 0) return c.json([]);

  // Fetch appointments for all groups (filter by time range if provided)
  const apptConditions = [];
  if (from) apptConditions.push(gte(appointments.startTime, new Date(from)));
  if (to) apptConditions.push(lte(appointments.startTime, new Date(to)));

  const allAppts = await db
    .select()
    .from(appointments)
    .where(apptConditions.length > 0 ? and(...apptConditions) : undefined);

  const groupApptMap = new Map<string, typeof appointments.$inferSelect[]>();
  for (const appt of allAppts) {
    if (!appt.groupId) continue;
    if (!groupApptMap.has(appt.groupId)) groupApptMap.set(appt.groupId, []);
    groupApptMap.get(appt.groupId)!.push(appt);
  }

  const result = groups
    .map((g) => ({
      ...g,
      appointments: (groupApptMap.get(g.id) ?? []).sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime()
      ),
    }))
    .filter((g) => !from || g.appointments.length > 0);

  if (isGroomer) {
    return c.json(
      result.filter((g) =>
        g.appointments.some(
          (a) => a.staffId === staffRow.id || a.batherStaffId === staffRow.id
        )
      )
    );
  }

  return c.json(result);
});

// ─── Get single group with its appointments ───────────────────────────────────

appointmentGroupsRouter.get("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  const [group] = await db
    .select()
    .from(appointmentGroups)
    .where(eq(appointmentGroups.id, id));
  if (!group) return c.json({ error: "Not found" }, 404);

  const groupAppts = await db
    .select({
      id: appointments.id,
      petId: appointments.petId,
      petName: pets.name,
      serviceId: appointments.serviceId,
      serviceName: services.name,
      staffId: appointments.staffId,
      batherStaffId: appointments.batherStaffId,
      staffName: staff.name,
      status: appointments.status,
      startTime: appointments.startTime,
      endTime: appointments.endTime,
      priceCents: appointments.priceCents,
      notes: appointments.notes,
    })
    .from(appointments)
    .leftJoin(pets, eq(appointments.petId, pets.id))
    .leftJoin(services, eq(appointments.serviceId, services.id))
    .leftJoin(staff, eq(appointments.staffId, staff.id))
    .where(eq(appointments.groupId, id))
    .orderBy(appointments.startTime);

  if (
    isGroomer &&
    !groupAppts.some(
      (a) => a.staffId === staffRow.id || a.batherStaffId === staffRow.id
    )
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [client] = await db
    .select({ name: clients.name, email: clients.email })
    .from(clients)
    .where(eq(clients.id, group.clientId));

  return c.json({ ...group, client, appointments: groupAppts });
});

// ─── Create group booking ─────────────────────────────────────────────────────

appointmentGroupsRouter.post(
  "/",
  zValidator("json", createGroupSchema),
  async (c) => {
    const db = getDb();
    const staffRow = c.get("staff");
    if (staffRow?.role === "groomer") {
      return c.json(
        { error: "Forbidden: groomers cannot create group bookings" },
        403
      );
    }
    const body = c.req.valid("json");
    const startTime = new Date(body.startTime);

    // Verify client exists
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, body.clientId));
    if (!client) return c.json({ error: "Client not found" }, 404);

    // Verify all pets belong to this client
    const petIds = body.pets.map((p) => p.petId);
    const petRows = await db
      .select({ id: pets.id, clientId: pets.clientId })
      .from(pets)
      .where(eq(pets.clientId, body.clientId));
    const ownedPetIds = new Set(petRows.map((p) => p.id));
    const unauthorized = petIds.filter((id) => !ownedPetIds.has(id));
    if (unauthorized.length > 0) {
      return c.json({ error: `Pet(s) not found for this client: ${unauthorized.join(", ")}` }, 422);
    }

    // Deduplicate pets in a single booking
    if (new Set(petIds).size !== petIds.length) {
      return c.json({ error: "Each pet can only appear once per group booking" }, 422);
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Check conflicts for each staff member
        for (const pet of body.pets) {
          if (!pet.staffId) continue;
          const endTime = new Date(pet.endTime);
          const conflicts = await tx
            .select({ id: appointments.id })
            .from(appointments)
            .where(
              and(
                eq(appointments.staffId, pet.staffId),
                lt(appointments.startTime, endTime),
                gte(appointments.endTime, startTime),
                ne(appointments.status, "cancelled"),
                ne(appointments.status, "no_show"),
              )
            )
            .limit(1);
          if (conflicts.length > 0) {
            throw Object.assign(
              new Error(`Staff conflict for pet ${pet.petId}`),
              { statusCode: 409, petId: pet.petId, staffId: pet.staffId }
            );
          }
        }

        // Create the group record
        const [group] = await tx
          .insert(appointmentGroups)
          .values({ clientId: body.clientId, notes: body.notes ?? null })
          .returning();
        if (!group) throw new Error("Failed to create appointment group");

        // Create one appointment per pet
        const createdAppts = [];
        for (const pet of body.pets) {
          const endTime = new Date(pet.endTime);
          const [appt] = await tx
            .insert(appointments)
            .values({
              clientId: body.clientId,
              petId: pet.petId,
              serviceId: pet.serviceId,
              staffId: pet.staffId ?? null,
              startTime,
              endTime,
              priceCents: pet.priceCents ?? null,
              groupId: group.id,
            })
            .returning();
          if (appt) createdAppts.push(appt);
        }

        return { group, appointments: createdAppts };
      });

      return c.json(result, 201);
    } catch (err: unknown) {
      const e = err as Error & { statusCode?: number };
      if (e.statusCode === 409) {
        return c.json({ error: "A staff member has a conflicting appointment at this time", detail: e.message }, 409);
      }
      throw err;
    }
  }
);

// ─── Update group notes ───────────────────────────────────────────────────────

appointmentGroupsRouter.patch(
  "/:id",
  zValidator("json", updateGroupSchema),
  async (c) => {
    const db = getDb();
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const staffRow = c.get("staff");
    const isGroomer = staffRow?.role === "groomer";

    const [group] = await db
      .select({ id: appointmentGroups.id })
      .from(appointmentGroups)
      .where(eq(appointmentGroups.id, id));
    if (!group) return c.json({ error: "Not found" }, 404);

    if (isGroomer) {
      const groupAppts = await db
        .select({ staffId: appointments.staffId, batherStaffId: appointments.batherStaffId })
        .from(appointments)
        .where(eq(appointments.groupId, id));
      if (
        !groupAppts.some(
          (a) => a.staffId === staffRow.id || a.batherStaffId === staffRow.id
        )
      ) {
        return c.json({ error: "Forbidden" }, 403);
      }
    }

    const [updated] = await db
      .update(appointmentGroups)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(appointmentGroups.id, id))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  }
);

// ─── Cancel all appointments in a group ──────────────────────────────────────

appointmentGroupsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  const [group] = await db
    .select({ id: appointmentGroups.id })
    .from(appointmentGroups)
    .where(eq(appointmentGroups.id, id));
  if (!group) return c.json({ error: "Not found" }, 404);

  if (isGroomer) {
    const groupAppts = await db
      .select({ staffId: appointments.staffId, batherStaffId: appointments.batherStaffId })
      .from(appointments)
      .where(eq(appointments.groupId, id));
    if (
      !groupAppts.some(
        (a) => a.staffId === staffRow.id || a.batherStaffId === staffRow.id
      )
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  await db
    .update(appointments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(appointments.groupId, id));

  return c.json({ ok: true });
});
