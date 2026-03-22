import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv, StaffRow } from "../middleware/rbac.js";

// ─── Mock staff fixtures ──────────────────────────────────────────────────────

const MANAGER: StaffRow = {
  id: "staff-manager-id",
  oidcSub: "oidc-manager-sub",
  role: "manager",
  name: "Manager McManager",
  email: "manager@example.com",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const GROOMER: StaffRow = {
  ...MANAGER,
  id: "staff-groomer-id",
  oidcSub: "oidc-groomer-sub",
  role: "groomer",
  name: "Groomer Gary",
  email: "groomer@example.com",
};

// ─── Shared mutable DB state ──────────────────────────────────────────────────

const PET_ID = "pet-uuid-1234";
const PHOTO_KEY = `pets/${PET_ID}/1700000000000.jpg`;

let dbPetRow: Record<string, unknown> | null;

function resetDb() {
  dbPetRow = { id: PET_ID, name: "Biscuit", photoKey: null, photoUploadedAt: null };
}

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@groombook/db", () => {
  const pets = new Proxy(
    { _name: "pets" },
    { get(t, p) { return p === "_name" ? "pets" : {}; } }
  );

  return {
    getDb: () => ({
      select: () => ({
        from: () => ({
          where: () => (dbPetRow ? [dbPetRow] : []),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => (dbPetRow ? [{ ...dbPetRow }] : []),
          }),
        }),
      }),
    }),
    pets,
    eq: vi.fn(),
  };
});

vi.mock("../lib/s3.js", () => ({
  getPresignedUploadUrl: vi.fn().mockResolvedValue("https://storage.example.com/presigned-put"),
  getPresignedGetUrl: vi.fn().mockResolvedValue("https://storage.example.com/presigned-get"),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

// ─── Import after mocks are set up ───────────────────────────────────────────

const { petsRouter } = await import("../routes/pets.js");

// ─── App builder ─────────────────────────────────────────────────────────────

function buildApp(staffRow: StaffRow) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("jwtPayload", { sub: staffRow.oidcSub ?? "" });
    c.set("staff", staffRow);
    await next();
  });
  app.route("/pets", petsRouter);
  return app;
}

// ─── Reset before each test ───────────────────────────────────────────────────

beforeEach(() => {
  resetDb();
  vi.clearAllMocks();
});

// ─── POST /:petId/photo/upload-url ───────────────────────────────────────────

describe("POST /pets/:petId/photo/upload-url", () => {
  it("returns presigned upload URL and object key for valid image contentType", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", fileSizeBytes: 1024 }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploadUrl: string; key: string };
    expect(body.uploadUrl).toBe("https://storage.example.com/presigned-put");
    expect(body.key).toMatch(/^pets\//);
    expect(body.key).toContain(PET_ID);
  });

  it("rejects non-image contentType with 400", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "application/pdf", fileSizeBytes: 1024 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects image/svg+xml with 400 (allowlist enforcement)", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/svg+xml", fileSizeBytes: 1024 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects fileSizeBytes over 5 MB with 400", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", fileSizeBytes: 6 * 1024 * 1024 }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when pet does not exist", async () => {
    dbPetRow = null;
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/jpeg", fileSizeBytes: 1024 }),
    });
    expect(res.status).toBe(404);
  });

  it("allows groomers to request an upload URL", async () => {
    const app = buildApp(GROOMER);
    const res = await app.request(`/pets/${PET_ID}/photo/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: "image/png", fileSizeBytes: 1024 }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── POST /:petId/photo/confirm ───────────────────────────────────────────────

describe("POST /pets/:petId/photo/confirm", () => {
  it("confirms upload and returns ok: true", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: PHOTO_KEY }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 400 when key is missing", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when pet does not exist", async () => {
    dbPetRow = null;
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: PHOTO_KEY }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when key does not belong to the pet", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "pets/other-pet-id/1700000000000.jpg" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid key/i);
  });

  it("deletes old photo from storage when re-uploading", async () => {
    const { deleteObject } = await import("../lib/s3.js");
    const oldKey = `pets/${PET_ID}/old.jpg`;
    dbPetRow = { ...dbPetRow!, photoKey: oldKey };

    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: PHOTO_KEY }),
    });

    expect(res.status).toBe(200);
    expect(deleteObject).toHaveBeenCalledWith(oldKey);
  });
});

// ─── DELETE /:petId/photo ────────────────────────────────────────────────────

describe("DELETE /pets/:petId/photo", () => {
  it("returns 404 with 'no photo' message when pet has no photo", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`, { method: "DELETE" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/no photo/i);
  });

  it("deletes photo and returns ok: true when photo exists", async () => {
    dbPetRow = { ...dbPetRow!, photoKey: PHOTO_KEY };
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("returns 404 when pet does not exist", async () => {
    dbPetRow = null;
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

// ─── GET /:petId/photo ────────────────────────────────────────────────────────

describe("GET /pets/:petId/photo", () => {
  it("returns 404 when pet has no photo", async () => {
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`);
    expect(res.status).toBe(404);
  });

  it("returns presigned GET URL when photo exists", async () => {
    dbPetRow = { ...dbPetRow!, photoKey: PHOTO_KEY };
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; photoKey: string };
    expect(body.url).toBe("https://storage.example.com/presigned-get");
    expect(body.photoKey).toBe(PHOTO_KEY);
  });

  it("returns 404 when pet does not exist", async () => {
    dbPetRow = null;
    const app = buildApp(MANAGER);
    const res = await app.request(`/pets/${PET_ID}/photo`);
    expect(res.status).toBe(404);
  });

  it("groomer can read photo URL", async () => {
    dbPetRow = { ...dbPetRow!, photoKey: PHOTO_KEY };
    const app = buildApp(GROOMER);
    const res = await app.request(`/pets/${PET_ID}/photo`);
    expect(res.status).toBe(200);
  });
});
