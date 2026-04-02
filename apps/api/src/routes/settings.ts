import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, businessSettings } from "@groombook/db";
import { requireSuperUser } from "../middleware/rbac.js";

export const settingsRouter = new Hono();

// GET /api/admin/settings — return current business settings
settingsRouter.get("/", async (c) => {
  const db = getDb();
  const [row] = await db.select().from(businessSettings).limit(1);
  if (!row) {
    // Auto-create default settings if none exist
    const [created] = await db.insert(businessSettings).values({}).returning();
    return c.json(created);
  }
  return c.json(row);
});

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

const updateSettingsSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  primaryColor: z.string().regex(hexColorRegex, "Must be a hex color like #4f8a6f").optional(),
  accentColor: z.string().regex(hexColorRegex, "Must be a hex color like #8b7355").optional(),
  logoBase64: z.string().max(700_000).nullable().optional(), // ~512KB base64
  logoMimeType: z
    .enum(["image/png", "image/svg+xml", "image/jpeg", "image/webp"])
    .nullable()
    .optional(),
});

// PATCH /api/admin/settings — update business settings
settingsRouter.patch(
  "/",
  requireSuperUser(),
  zValidator("json", updateSettingsSchema),
  async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    // Get or create the settings row
    const rows = await db.select().from(businessSettings).limit(1);
    let settingsId: string;
    if (rows[0]) {
      settingsId = rows[0].id;
    } else {
      const [inserted] = await db.insert(businessSettings).values({}).returning();
      if (!inserted) throw new Error("Failed to create default settings");
      settingsId = inserted.id;
    }

    const [updated] = await db
      .update(businessSettings)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(businessSettings.id, settingsId))
      .returning();

    return c.json(updated);
  }
);
