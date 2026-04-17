import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import { and, eq, exists, getDb, or, pets, appointments } from "@groombook/db";
import type { AppEnv } from "../middleware/rbac.js";
import {
  getPresignedUploadUrl,
  getPresignedGetUrl,
  deleteObject,
} from "../lib/s3.js";

export const petsRouter = new Hono<AppEnv>();

const createPetSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().min(1).max(200),
  species: z.string().min(1).max(100),
  breed: z.string().max(200).optional(),
  weightKg: z.number().positive().optional(),
  dateOfBirth: z.string().datetime().optional(),
  healthAlerts: z.string().max(2000).optional(),
  groomingNotes: z.string().max(2000).optional(),
  cutStyle: z.string().max(500).optional(),
  shampooPreference: z.string().max(500).optional(),
  specialCareNotes: z.string().max(2000).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
});

const updatePetSchema = createPetSchema.partial().omit({ clientId: true });

// List pets, optionally filtered by clientId.
// Groomers see only pets owned by clients with ≥1 appointment for this groomer.
petsRouter.get("/", async (c) => {
  const db = getDb();
  const clientId = c.req.query("clientId");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";

  // Groomer: filter to pets whose client has an appointment for this groomer
  const groomerClientFilter = isGroomer
    ? exists(
        db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.clientId, pets.clientId),
              or(
                eq(appointments.staffId, staffRow.id),
                eq(appointments.batherStaffId, staffRow.id)
              )
            )
          )
      )
    : undefined;

  const conditions = [];
  if (clientId) conditions.push(eq(pets.clientId, clientId));
  if (groomerClientFilter) conditions.push(groomerClientFilter);

  const rows = await db
    .select()
    .from(pets)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return c.json(rows);
});

petsRouter.get("/:id", async (c) => {
  const db = getDb();
  const petId = c.req.param("id");
  const staffRow = c.get("staff");
  const isGroomer = staffRow?.role === "groomer";
  const [row] = await db
    .select()
    .from(pets)
    .where(eq(pets.id, petId));
  if (!row) return c.json({ error: "Not found" }, 404);
  // Groomer: 403 if no appointment linkage to this pet's client
  if (isGroomer) {
    const [linkage] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.clientId, row.clientId),
          or(
            eq(appointments.staffId, staffRow.id),
            eq(appointments.batherStaffId, staffRow.id)
          )
        )
      )
      .limit(1);
    if (!linkage) return c.json({ error: "Forbidden" }, 403);
  }
  return c.json(row);
});

petsRouter.post("/", zValidator("json", createPetSchema), async (c) => {
  const db = getDb();
  const { weightKg, dateOfBirth, customFields, ...rest } = c.req.valid("json");
  const [row] = await db
    .insert(pets)
    .values({
      ...rest,
      weightKg: weightKg?.toString(),
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      customFields: customFields ?? {},
    })
    .returning();
  return c.json(row, 201);
});

petsRouter.patch(
  "/:id",
  zValidator("json", updatePetSchema),
  async (c) => {
    const db = getDb();
    const { weightKg, dateOfBirth, customFields, ...rest } = c.req.valid("json");
    const [row] = await db
      .update(pets)
      .set({
        ...rest,
        weightKg: weightKg?.toString(),
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
        ...(customFields !== undefined ? { customFields } : {}),
        updatedAt: new Date(),
      })
      .where(eq(pets.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  }
);

petsRouter.delete("/:id", async (c) => {
  const db = getDb();
  const [row] = await db
    .delete(pets)
    .where(eq(pets.id, c.req.param("id")))
    .returning();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ─── Photo routes ──────────────────────────────────────────────────────────────

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

const uploadUrlSchema = z.object({
  contentType: z.string().refine((v) => ALLOWED_CONTENT_TYPES.has(v), {
    message: "contentType must be one of: image/jpeg, image/png, image/webp, image/gif",
  }),
  fileSizeBytes: z.number().int().positive().max(MAX_PHOTO_SIZE, {
    message: "File must not exceed 5 MB",
  }),
});

const confirmSchema = z.object({
  key: z.string().min(1),
});

/**
 * POST /:petId/photo/upload-url
 * Returns a presigned S3 PUT URL and the object key for the upload.
 * All staff roles (manager, receptionist, groomer) may call this.
 */
petsRouter.post(
  "/:petId/photo/upload-url",
  zValidator("json", uploadUrlSchema),
  async (c) => {
    const db = getDb();
    const petId = c.req.param("petId");
    const { contentType, fileSizeBytes } = c.req.valid("json");

    const [pet] = await db.select().from(pets).where(eq(pets.id, petId));
    if (!pet) return c.json({ error: "Pet not found" }, 404);

    const ext = contentType.split("/")[1] ?? "jpg";
    const key = `pets/${petId}/${Date.now()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType, fileSizeBytes);

    return c.json({ uploadUrl, key });
  }
);

/**
 * POST /:petId/photo/confirm
 * Called after the client has successfully uploaded to the presigned URL.
 * Records the object key in the DB.
 */
petsRouter.post(
  "/:petId/photo/confirm",
  zValidator("json", confirmSchema),
  async (c) => {
    const db = getDb();
    const petId = c.req.param("petId");
    const { key } = c.req.valid("json");

    // Validate that the key belongs to this pet to prevent key hijacking
    if (!key.startsWith(`pets/${petId}/`)) {
      return c.json({ error: "Invalid key" }, 400);
    }

    const [pet] = await db.select().from(pets).where(eq(pets.id, petId));
    if (!pet) return c.json({ error: "Pet not found" }, 404);

    // Delete the previous photo from storage to avoid orphaned objects
    if (pet.photoKey) {
      try {
        await deleteObject(pet.photoKey);
      } catch (err) {
        console.warn(`Failed to delete previous photo ${pet.photoKey}, orphaned object may remain:`, err);
      }
    }

    const [row] = await db
      .update(pets)
      .set({ photoKey: key, photoUploadedAt: new Date(), updatedAt: new Date() })
      .where(eq(pets.id, petId))
      .returning();
    if (!row) return c.json({ error: "Pet not found" }, 404);

    return c.json({ ok: true, photoKey: row.photoKey });
  }
);

/**
 * DELETE /:petId/photo
 * Removes the photo from object storage and clears the DB record.
 * All staff roles (manager, receptionist, groomer) may call this.
 */
petsRouter.delete("/:petId/photo", async (c) => {
  const db = getDb();
  const petId = c.req.param("petId");

  const [pet] = await db.select().from(pets).where(eq(pets.id, petId));
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!pet.photoKey) return c.json({ error: "No photo on file" }, 404);

  try {
    await deleteObject(pet.photoKey);
  } catch (err) {
    console.warn(`Failed to delete photo ${pet.photoKey} from S3, orphaned object may remain:`, err);
  }
  await db
    .update(pets)
    .set({ photoKey: null, photoUploadedAt: null, updatedAt: new Date() })
    .where(eq(pets.id, petId));

  return c.json({ ok: true });
});

/**
 * GET /:petId/photo
 * Returns a presigned GET URL for the pet's photo.
 * All authenticated staff may access (read).
 */
petsRouter.get("/:petId/photo", async (c) => {
  const db = getDb();
  const petId = c.req.param("petId");

  const [pet] = await db.select().from(pets).where(eq(pets.id, petId));
  if (!pet) return c.json({ error: "Pet not found" }, 404);
  if (!pet.photoKey) return c.json({ error: "No photo on file" }, 404);

  const url = await getPresignedGetUrl(pet.photoKey);
  return c.json({ url, photoKey: pet.photoKey, photoUploadedAt: pet.photoUploadedAt });
});
