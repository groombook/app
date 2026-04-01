/**
 * Admin seed endpoint — populates minimal known-user seed data via the API.
 *
 * This is the canonical way to seed prod/demo data. The old approach (seed.ts
 * writing directly to the DB) bypasses API validation and audit trails.
 *
 * Security: This endpoint is manager-only (enforced via requireRole in index.ts).
 * It is disabled when AUTH_DISABLED=true — dev/test seeding should use the
 * direct-DB seed.ts in that mode.
 */

import { Hono } from "hono";
import { eq, getDb, staff, clients, pets, services } from "@groombook/db";

export const adminSeedRouter = new Hono();

const KNOWN_STAFF = {
  name: "Demo Manager",
  email: "demo-manager@groombook.dev",
  oidcSub: "demo-manager-001",
  role: "manager" as const,
  active: true,
};

const KNOWN_CLIENT = {
  name: "Demo Client",
  email: "demo-client@example.com",
  phone: "555-0001",
  address: "1 Demo Street, Demo City, CA 90210",
};

const DEMO_PET = {
  name: "Demo Dog",
  species: "Dog",
  breed: "Golden Retriever",
  weightKg: "30.00",
};

const DEMO_SERVICES = [
  { id: "b0000001-0000-0000-0000-000000000001", name: "Bath & Brush", description: "Full bath, blow-dry, brush out, and ear cleaning", basePriceCents: 4500, durationMinutes: 45 },
  { id: "b0000001-0000-0000-0000-000000000002", name: "Full Groom — Small", description: "Complete grooming for dogs under 25 lbs", basePriceCents: 6500, durationMinutes: 60 },
  { id: "b0000001-0000-0000-0000-000000000003", name: "Full Groom — Medium", description: "Complete grooming for dogs 25-50 lbs", basePriceCents: 8000, durationMinutes: 75 },
  { id: "b0000001-0000-0000-0000-000000000004", name: "Nail Trim", description: "Nail clipping and filing", basePriceCents: 1500, durationMinutes: 15 },
];

adminSeedRouter.post("/seed", async (c) => {
  // Refuse to run when AUTH_DISABLED — dev environments use direct-DB seeding
  if (process.env.AUTH_DISABLED === "true") {
    return c.json(
      {
        error:
          "Seed endpoint is not available when AUTH_DISABLED=true. Use direct DB seeding for dev/test environments.",
      },
      403
    );
  }

  const db = getDb();
  const results: string[] = [];

  // ── Staff: Demo Manager ─────────────────────────────────────────────────────
  const [existingStaff] = await db
    .select()
    .from(staff)
    .where(eq(staff.email, KNOWN_STAFF.email));

  if (existingStaff) {
    results.push(`Staff '${KNOWN_STAFF.name}' already exists (id: ${existingStaff.id})`);
  } else {
    const [created] = await db.insert(staff).values(KNOWN_STAFF).returning();
    results.push(`Created staff '${KNOWN_STAFF.name}' (id: ${created!.id}, oidcSub: ${KNOWN_STAFF.oidcSub})`);
  }

  // ── Services: idempotent upsert using name as unique key ────────────────────
  // NOTE: UNIQUE constraint on services.name must exist (via migration 0020).
  // Both this admin seed and the main DB seed use the same deterministic IDs
  // and ON CONFLICT (name), ensuring consistency across both seed paths.
  for (const svc of DEMO_SERVICES) {
    await db.insert(services)
      .values({ ...svc, active: true })
      .onConflictDoUpdate({
        target: services.name,
        set: { description: svc.description, basePriceCents: svc.basePriceCents, durationMinutes: svc.durationMinutes, active: true },
      });
  }
  results.push(`Upserted ${DEMO_SERVICES.length} services`);

  // ── Client: Demo Client ───────────────────────────────────────────────────
  const [existingClient] = await db
    .select()
    .from(clients)
    .where(eq(clients.email, KNOWN_CLIENT.email));

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    results.push(`Client '${KNOWN_CLIENT.name}' already exists (id: ${clientId})`);
  } else {
    const [created] = await db.insert(clients).values(KNOWN_CLIENT).returning();
    clientId = created!.id;
    results.push(`Created client '${KNOWN_CLIENT.name}' (id: ${clientId})`);
  }

  // ── Pet: Demo Dog ──────────────────────────────────────────────────────────
  const existingPets = await db
    .select()
    .from(pets)
    .where(eq(pets.clientId, clientId));

  const demoDog = existingPets.find(
    (p) => p.name === DEMO_PET.name && p.species === DEMO_PET.species
  );

  if (demoDog) {
    results.push(`Pet '${DEMO_PET.name}' already exists for Demo Client (id: ${demoDog.id})`);
  } else {
    const [created] = await db
      .insert(pets)
      .values({
        clientId,
        name: DEMO_PET.name,
        species: DEMO_PET.species,
        breed: DEMO_PET.breed,
        weightKg: DEMO_PET.weightKg,
        dateOfBirth: new Date("2020-06-15T00:00:00Z"),
      })
      .returning();
    results.push(`Created pet '${DEMO_PET.name}' for Demo Client (id: ${created!.id})`);
  }

  return c.json({
    message: "Seed complete",
    details: results,
    credentials: {
      note: "For dev-mode access, use X-Dev-User-Id: demo-manager-001 header",
      staffOidcSub: KNOWN_STAFF.oidcSub,
    },
  });
});
