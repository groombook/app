import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, eq, getDb, ne, staff, appointments } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const staffRouter = new Hono<AppEnv>();

const createStaffSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  role: z.enum(["groomer", "receptionist", "manager"]).default("groomer"),
  oidcSub: z.string().optional(),
  active: z.boolean().default(true),
});

const updateStaffSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  role: z.enum(["groomer", "receptionist", "manager"]).optional(),
  active: z.boolean().optional(),
  isSuperUser: z.boolean().optional(),
  oidcSub: z.string().optional(),
});

staffRouter.get("/me", async (c) => {
  const staffRow = c.get("staff");
  if (!staffRow) return c.json({ error: "Staff record not found" }, 404);
  // Explicitly pick serializable fields to avoid BigInt/Date/undefined serialization issues
  return c.json({
    id: staffRow.id,
    name: staffRow.name,
    email: staffRow.email,
    role: staffRow.role,
    active: staffRow.active,
    isSuperUser: staffRow.isSuperUser,
    userId: staffRow.userId,
    oidcSub: staffRow.oidcSub,
    createdAt: staffRow.createdAt,
    updatedAt: staffRow.updatedAt,
  });
});

staffRouter.get("/", async (c) => {
  const db = getDb();
  const includeInactive = c.req.query("includeInactive") === "true";
  const rows = includeInactive
    ? await db.select().from(staff).orderBy(staff.name)
    : await db.select().from(staff).where(eq(staff.active, true)).orderBy(staff.name);
  return c.json(rows);
});

staffRouter.get("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, c.req.param("id")));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

staffRouter.post("/", zValidator("json", createStaffSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const [row] = await db.insert(staff).values(body).returning();
  return c.json(row, 201);
});

staffRouter.patch("/:id", zValidator("json", updateStaffSchema), async (c) => {
  const db = getDb();
  const currentStaff = c.get("staff");
  const body = c.req.valid("json");
  const targetId = c.req.param("id");

  // Only super users can change isSuperUser
  if (body.isSuperUser !== undefined && !currentStaff.isSuperUser) {
    return c.json({ error: "Forbidden: super user privileges required to modify super user status" }, 403);
  }

  // Before revoking or deactivating the last super user, serialize access with a
  // transaction + FOR UPDATE to prevent a race where two concurrent requests both
  // pass the count check and leave zero super users.
  const needsSuperUserGuard = body.isSuperUser === false || body.active === false;
  if (needsSuperUserGuard) {
    const [guardError, row] = await db.transaction(async (tx) => {
      // Lock the target row so no other request can modify it concurrently
      const [target] = await tx
        .select({ isSuperUser: staff.isSuperUser })
        .from(staff)
        .where(eq(staff.id, targetId))
        .limit(1)
        .for("update");

      if (!target) return ["Not found", null as (typeof staff.$inferSelect | null)];

      // Only enforce guard if the target is actually a super user
      const isRevokingSuperUser = body.isSuperUser === false && target.isSuperUser;
      const isDeactivatingSuperUser = body.active === false && target.isSuperUser;
      if (!isRevokingSuperUser && !isDeactivatingSuperUser) {
        const [updated] = await tx
          .update(staff)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(staff.id, targetId))
          .returning();
        return [null, updated];
      }

      // Count active super users (excluding target — it will be changed)
      const superUserCount = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.isSuperUser, true), eq(staff.active, true), ne(staff.id, targetId)))
        .limit(2);

      if (superUserCount.length <= 1) {
        return [
          body.isSuperUser === false
            ? "Cannot revoke the last super user. Assign another super user first."
            : "Cannot deactivate the last super user. Assign another super user first.",
          null,
        ];
      }

      // Perform the update (outside the count query but still in the transaction)
      await tx
        .update(staff)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(staff.id, targetId));

      // Re-select to get the post-update state (avoids FOR UPDATE + RETURNING issues in some DB drivers)
      const [updated] = await tx
        .select()
        .from(staff)
        .where(eq(staff.id, targetId))
        .limit(1);
      return [null, updated];
    });

    if (guardError) return c.json({ error: guardError }, guardError === "Not found" ? 404 : 400);
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }

  const [row] = await db
    .update(staff)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(staff.id, targetId))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

staffRouter.delete("/:id", async (c) => {
  const db = getDb();
  const id = c.req.param("id");

  // Prevent deleting staff who have existing non-cancelled appointments (fixes #21).
  const activeAppointments = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.staffId, id),
        ne(appointments.status, "cancelled"),
        ne(appointments.status, "no_show"),
      )
    )
    .limit(1);
  if (activeAppointments.length > 0) {
    return c.json(
      {
        error:
          "Cannot delete staff member with existing appointments. Reassign or cancel their appointments first.",
      },
      409
    );
  }

  // Prevent deleting the last super user — use transaction to avoid race
  const [guardError] = await db.transaction(async (tx) => {
    const [targetStaff] = await tx
      .select({ isSuperUser: staff.isSuperUser })
      .from(staff)
      .where(eq(staff.id, id))
      .limit(1)
      .for("update");

    if (!targetStaff) return ["Not found", null];

    if (targetStaff.isSuperUser) {
      const superUserCount = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.isSuperUser, true), eq(staff.active, true), ne(staff.id, id)))
        .limit(2);
      if (superUserCount.length <= 1) {
        return ["Cannot delete the last super user. Assign another super user first.", null];
      }
    }

    const [row] = await tx.delete(staff).where(eq(staff.id, id)).returning();
    return [null, row];
  });

  if (guardError === "Not found") return c.json({ error: "Not found" }, 404);
  if (guardError) return c.json({ error: guardError }, 400);
  return c.json({ ok: true });
});

staffRouter.post("/:id/ical-token", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const staffRow = c.get("staff");

  if (staffRow.role !== "manager" && staffRow.id !== id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [member] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, id))
    .limit(1);

  if (!member) return c.json({ error: "Not found" }, 404);

  const token = randomBytes(32).toString("hex");
  const [updated] = await db
    .update(staff)
    .set({ icalToken: token, updatedAt: new Date() })
    .where(eq(staff.id, id))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ icalToken: updated.icalToken });
});

staffRouter.delete("/:id/ical-token", async (c) => {
  const db = getDb();
  const id = c.req.param("id");
  const staffRow = c.get("staff");

  if (staffRow.role !== "manager" && staffRow.id !== id) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const [member] = await db
    .select()
    .from(staff)
    .where(eq(staff.id, id))
    .limit(1);

  if (!member) return c.json({ error: "Not found" }, 404);

  await db
    .update(staff)
    .set({ icalToken: null, updatedAt: new Date() })
    .where(eq(staff.id, id));

  return c.json({ ok: true });
});
