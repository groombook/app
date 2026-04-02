import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, businessSettings } from "@groombook/db";
import { getPresignedUploadUrl, getPresignedGetUrl, deleteObject } from "../lib/s3.js";
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

// ─── Logo routes ──────────────────────────────────────────────────────────────

const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/svg+xml", "image/jpeg", "image/webp"]);
const MAX_LOGO_SIZE = 512 * 1024; // 512 KB

const logoUploadUrlSchema = z.object({
  contentType: z.string().refine((v) => ALLOWED_LOGO_TYPES.has(v), {
    message: "contentType must be one of: image/png, image/svg+xml, image/jpeg, image/webp",
  }),
  fileSizeBytes: z.number().int().positive().max(MAX_LOGO_SIZE, {
    message: "File must not exceed 512 KB",
  }),
});

const logoConfirmSchema = z.object({
  key: z.string().min(1),
});

/**
 * POST /api/admin/settings/logo/upload-url
 * Returns a presigned S3 PUT URL and the object key for logo upload.
 */
settingsRouter.post(
  "/logo/upload-url",
  zValidator("json", logoUploadUrlSchema),
  async (c) => {
    const db = getDb();
    const { contentType, fileSizeBytes } = c.req.valid("json");

    const rows = await db.select().from(businessSettings).limit(1);
    if (!rows[0]) {
      return c.json({ error: "Settings not found" }, 404);
    }
    const settingsId = rows[0].id;

    const ext = contentType.split("/")[1] ?? "png";
    const key = `logos/${settingsId}/${Date.now()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType, fileSizeBytes);

    return c.json({ uploadUrl, key });
  }
);

/**
 * POST /api/admin/settings/logo/confirm
 * Called after the client has successfully uploaded to the presigned URL.
 * Records the object key in the DB and clears legacy base64 fields.
 */
settingsRouter.post(
  "/logo/confirm",
  zValidator("json", logoConfirmSchema),
  async (c) => {
    const db = getDb();
    const { key } = c.req.valid("json");

    const rows = await db.select().from(businessSettings).limit(1);
    if (!rows[0]) {
      return c.json({ error: "Settings not found" }, 404);
    }
    const settingsId = rows[0].id;

    // Validate key prefix
    if (!key.startsWith(`logos/${settingsId}/`)) {
      return c.json({ error: "Invalid key" }, 400);
    }

    // Delete previous S3 object if any
    if (rows[0].logoKey) {
      await deleteObject(rows[0].logoKey);
    }

    const [updated] = await db
      .update(businessSettings)
      .set({ logoKey: key, logoBase64: null, logoMimeType: null, updatedAt: new Date() })
      .where(eq(businessSettings.id, settingsId))
      .returning();

    if (!updated) {
      return c.json({ error: "Settings not found" }, 404);
    }

    return c.json({ ok: true, logoKey: updated.logoKey });
  }
);

/**
 * GET /api/admin/settings/logo
 * Returns a presigned GET URL for the logo.
 */
settingsRouter.get("/logo", async (c) => {
  const db = getDb();

  const [row] = await db.select().from(businessSettings).limit(1);
  if (!row) return c.json({ error: "Settings not found" }, 404);
  if (!row.logoKey) return c.json({ error: "No logo on file" }, 404);

  const url = await getPresignedGetUrl(row.logoKey);
  return c.json({ url, logoKey: row.logoKey });
});

/**
 * DELETE /api/admin/settings/logo
 * Removes the logo from S3 and clears the DB record.
 */
settingsRouter.delete("/logo", async (c) => {
  const db = getDb();

  const [row] = await db.select().from(businessSettings).limit(1);
  if (!row) return c.json({ error: "Settings not found" }, 404);
  if (!row.logoKey) return c.json({ error: "No logo on file" }, 404);

  await deleteObject(row.logoKey);
  await db
    .update(businessSettings)
    .set({ logoKey: null, updatedAt: new Date() })
    .where(eq(businessSettings.id, row.id));

  return c.json({ ok: true });
});
