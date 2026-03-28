import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, exists, getDb, staff, businessSettings } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";

export const setupRouter = new Hono<AppEnv>();

// GET /api/setup/status — public (no auth), returns whether setup is needed
setupRouter.get("/status", async (c) => {
  const db = getDb();

  // Check if any super user exists
  const [superUser] = await db
    .select({ id: staff.id })
    .from(staff)
    .where(eq(staff.isSuperUser, true))
    .limit(1);

  return c.json({ needsSetup: !superUser });
});

const setupSchema = z.object({
  businessName: z.string().min(1).max(200),
});

// POST /api/setup — authenticated, marks current staff as super user and sets business name
setupRouter.post("/", zValidator("json", setupSchema), async (c) => {
  const db = getDb();
  const body = c.req.valid("json");
  const currentStaff = c.get("staff");

  // Use a transaction with row-level locking to prevent race conditions
  const result = await db.transaction(async (tx) => {
    // Lock the business_settings row for update to prevent concurrent setup
    const [existingSettings] = await tx
      .select({ id: businessSettings.id })
      .from(businessSettings)
      .limit(1);

    // Check if any super user already exists (race condition guard)
    const [existingSuperUser] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(eq(staff.isSuperUser, true))
      .limit(1);

    if (existingSuperUser) {
      return { error: "Setup has already been completed. A super user already exists.", code: 409 };
    }

    // Update or create business settings with the business name
    if (existingSettings) {
      await tx
        .update(businessSettings)
        .set({ businessName: body.businessName, updatedAt: new Date() })
        .where(eq(businessSettings.id, existingSettings.id));
    } else {
      await tx.insert(businessSettings).values({ businessName: body.businessName });
    }

    // Mark the current staff as super user
    const [updatedStaff] = await tx
      .update(staff)
      .set({ isSuperUser: true, updatedAt: new Date() })
      .where(eq(staff.id, currentStaff.id))
      .returning();

    return { staff: updatedStaff };
  });

  if ("error" in result) {
    return c.json({ error: result.error }, result.code);
  }

  return c.json({ ok: true, staff: result.staff }, 201);
});