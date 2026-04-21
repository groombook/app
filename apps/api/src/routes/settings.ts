import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { eq, getDb, businessSettings } from "@groombook/db";
import { getPresignedUploadUrl, getPresignedGetUrl, deleteObject, putObject, getObject } from "../lib/s3.js";
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
 * POST /api/admin/settings/logo/upload
 * Proxy upload through the API server to avoid mixed-content issues with
 * pre-signed URLs that use the internal HTTP endpoint. The file is uploaded
 * directly to S3 from the server using the internal endpoint.
 */
settingsRouter.post("/logo/upload", requireSuperUser(), async (c) => {
  const db = getDb();

  // Parse multipart form data (file field)
  const body = await c.req.parseBody({ all: true });
  const file = body["file"];

  if (!file || !(file instanceof File)) {
    return c.json({ error: "No file provided" }, 400);
  }

  const contentType = file.type;
  if (!ALLOWED_LOGO_TYPES.has(contentType)) {
    return c.json(
      {
        error:
          "contentType must be one of: image/png, image/svg+xml, image/jpeg, image/webp",
      },
      400
    );
  }

  const fileSizeBytes = file.size;
  if (fileSizeBytes > MAX_LOGO_SIZE) {
    return c.json({ error: "File must not exceed 512 KB" }, 400);
  }

  const rows = await db.select().from(businessSettings).limit(1);
  if (!rows[0]) {
    return c.json({ error: "Settings not found" }, 404);
  }
  const settingsId = rows[0].id;

  const ext = contentType.split("/")[1] ?? "png";
  const key = `logos/${settingsId}/${Date.now()}.${ext}`;

  // Read file into buffer and upload directly to S3 (bypasses pre-signed URL)
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await putObject(key, buffer, contentType, fileSizeBytes);

  // Delete previous S3 object if any
  if (rows[0].logoKey) {
    await deleteObject(rows[0].logoKey);
  }

  // Update database with new logo key
  const [updated] = await db
    .update(businessSettings)
    .set({
      logoKey: key,
      logoBase64: null,
      logoMimeType: null,
      updatedAt: new Date(),
    })
    .where(eq(businessSettings.id, settingsId))
    .returning();

  if (!updated) {
    return c.json({ error: "Settings not found" }, 404);
  }

  return c.json({ ok: true, logoKey: updated.logoKey });
});

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
 * Proxies the logo from S3 so the browser never sees an S3 URL.
 * Returns the image bytes with proper Content-Type.
 */
settingsRouter.get("/logo", async (c) => {
  const db = getDb();

  const [row] = await db.select().from(businessSettings).limit(1);
  if (!row) return c.json({ error: "Settings not found" }, 404);
  if (!row.logoKey) return c.json({ error: "No logo on file" }, 404);

  const { body, contentType } = await getObject(row.logoKey);
  return new Response(Buffer.from(body), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    },
  });
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
