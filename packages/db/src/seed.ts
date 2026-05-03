/**
 * Seed script — generates deterministic, PII-free test data for Groom Book.
 *
 * Creates:
 *  - 1 manager + 1 receptionist + 3 groomers + 3 bathers (8 staff total)
 *  - 10 services
 *  - 500 clients, each with 1-3 dogs
 *  - ~2 500 appointments spread across the past 12 months
 *  - Invoices for completed appointments with line items and tip splits
 *  - Grooming visit logs for completed appointments
 *
 * Output is fully deterministic: the same seed value always produces the
 * same rows with the same IDs.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx packages/db/src/seed.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "./schema.js";

// ── Seed profile configuration ─────────────────────────────────────────────

type SeedProfile = "dev" | "uat" | "demo";

interface ProfileConfig {
  staffCount: { manager: number; receptionist: number; groomer: number; bather: number };
  clientCount: number;
  appointmentsBackDays: number;
  appointmentsForwardDays: number;
  invoiceCount: number;
  includeUatClients: boolean;
}

const profiles: Record<SeedProfile, ProfileConfig> = {
  dev: {
    staffCount: { manager: 1, receptionist: 1, groomer: 2, bather: 0 },
    clientCount: 100,
    appointmentsBackDays: 7,
    appointmentsForwardDays: 30,
    invoiceCount: 1000,
    includeUatClients: false,
  },
  uat: {
    staffCount: { manager: 1, receptionist: 1, groomer: 3, bather: 3 },
    clientCount: 500,
    appointmentsBackDays: 30,
    appointmentsForwardDays: 90,
    invoiceCount: 4000,
    includeUatClients: true,
  },
  demo: {
    staffCount: { manager: 1, receptionist: 1, groomer: 3, bather: 3 },
    clientCount: 500,
    appointmentsBackDays: 30,
    appointmentsForwardDays: 90,
    invoiceCount: 4000,
    includeUatClients: true,
  },
};

function getProfile(): SeedProfile {
  const raw = process.env.SEED_PROFILE?.toLowerCase();
  if (raw === "dev" || raw === "uat" || raw === "demo") {
    return raw;
  }
  return "uat";
}

// ── Deterministic PRNG (Mulberry32) ──────────────────────────────────────────

/**
 * Returns a seeded pseudo-random number generator.
 * Same seed → identical sequence of numbers every run.
 */
function createPrng(seed: number): () => number {
  let s = seed | 0;
  return function (): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = createPrng(42);

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return a random element from an array using the seeded PRNG. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

/** Return n distinct random elements from an array. */
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + rand() * (end.getTime() - start.getTime()));
}

/**
 * Generate a deterministic UUID v4 from the seeded PRNG.
 * Conforms to RFC 4122 §4.4 (variant bits set correctly).
 */
function uuid(): string {
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const bytes = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
  bytes[6] = ((bytes[6]! & 0x0f) | 0x40);   // version 4
  bytes[8] = ((bytes[8]! & 0x3f) | 0x80);   // variant bits
  return [
    bytes.slice(0, 4).map(hex).join(""),
    bytes.slice(4, 6).map(hex).join(""),
    bytes.slice(6, 8).map(hex).join(""),
    bytes.slice(8, 10).map(hex).join(""),
    bytes.slice(10, 16).map(hex).join(""),
  ].join("-");
}

// ── Data pools ───────────────────────────────────────────────────────────────

const firstNames = [
  "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason",
  "Isabella", "Lucas", "Mia", "Logan", "Charlotte", "Aiden", "Amelia",
  "James", "Harper", "Benjamin", "Evelyn", "Elijah", "Abigail", "William",
  "Emily", "Sebastian", "Elizabeth", "Henry", "Sofia", "Alexander", "Avery",
  "Daniel", "Scarlett", "Michael", "Grace", "Jackson", "Chloe", "Owen",
  "Victoria", "Jack", "Riley", "Caleb", "Aria", "Luke", "Luna", "Ryan",
  "Zoey", "Nathan", "Penelope", "Carter", "Layla", "Dylan", "Nora",
  "Andrew", "Lily", "Gabriel", "Eleanor", "Samuel", "Hannah", "David",
  "Lillian", "Matthew", "Addison", "Joseph", "Aubrey", "Isaac", "Stella",
  "Joshua", "Natalie", "Wyatt", "Zoe", "John", "Leah", "Leo", "Hazel",
  "Julian", "Violet", "Christopher", "Aurora", "Jonathan", "Savannah",
  "Lincoln", "Audrey", "Thomas", "Brooklyn", "Asher", "Bella", "Theodore",
  "Claire", "Jaxon", "Skylar", "Robert", "Lucy", "Charles", "Paisley",
  "Adrian", "Anna", "Miles", "Caroline", "Dominic", "Genesis", "Connor",
];

const lastNames = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
  "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
  "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
  "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
  "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
  "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
  "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
  "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner", "Diaz",
  "Parker", "Cruz", "Edwards", "Collins", "Reyes", "Stewart", "Morris",
  "Morales", "Murphy", "Cook", "Rogers", "Gutierrez", "Ortiz", "Morgan",
  "Cooper", "Peterson", "Bailey", "Reed", "Kelly", "Howard", "Ramos",
  "Kim", "Cox", "Ward", "Richardson", "Watson", "Brooks", "Chavez",
  "Wood", "James", "Bennett", "Gray", "Mendoza", "Ruiz", "Hughes",
  "Price", "Alvarez", "Castillo", "Sanders", "Patel", "Myers", "Long",
  "Ross", "Foster", "Jimenez",
];

const dogNames = [
  "Buddy", "Max", "Charlie", "Cooper", "Rocky", "Bear", "Duke", "Tucker",
  "Jack", "Oliver", "Milo", "Bentley", "Zeus", "Winston", "Beau", "Finn",
  "Leo", "Teddy", "Louie", "Toby", "Harley", "Bailey", "Murphy", "Rex",
  "Bruno", "Gus", "Diesel", "Moose", "Henry", "Archie", "Luna", "Bella",
  "Daisy", "Lucy", "Sadie", "Molly", "Maggie", "Chloe", "Sophie", "Stella",
  "Penny", "Zoey", "Ruby", "Rosie", "Lola", "Willow", "Nala", "Ginger",
  "Coco", "Roxy", "Ellie", "Piper", "Gracie", "Millie", "Lady", "Pepper",
  "Hazel", "Dixie", "Winnie", "Bonnie", "Maple", "Ivy", "Pearl", "Olive",
];

const dogBreeds = [
  "Golden Retriever", "Labrador Retriever", "Poodle", "German Shepherd",
  "Bulldog", "Beagle", "Rottweiler", "Dachshund", "Yorkshire Terrier",
  "Boxer", "Siberian Husky", "Cavalier King Charles Spaniel",
  "Doberman Pinscher", "Great Dane", "Miniature Schnauzer",
  "Shih Tzu", "Boston Terrier", "Bernese Mountain Dog", "Pomeranian",
  "Havanese", "Cocker Spaniel", "Border Collie", "Shetland Sheepdog",
  "Brittany", "English Springer Spaniel", "Maltese", "Bichon Frise",
  "West Highland White Terrier", "Vizsla", "Chihuahua", "Collie",
  "Basset Hound", "Newfoundland", "Samoyed", "Australian Shepherd",
  "Pembroke Welsh Corgi", "French Bulldog", "Weimaraner", "Puggle",
  "Mixed Breed", "Mixed Breed", "Mixed Breed",
];

const cutStyles = [
  "Puppy Cut", "Teddy Bear Cut", "Lion Cut", "Breed Standard",
  "Summer Shave", "Kennel Cut", "Lamb Cut", "Continental Clip",
  "Sporting Clip", "Sanitary Trim", "Face & Feet Trim", "Full Groom",
  null,
];

const shampoos = [
  "Oatmeal Sensitive", "Whitening Formula", "Flea & Tick", "Hypoallergenic",
  "De-shedding", "Puppy Gentle", "Medicated", "Coconut Oil",
  "Lavender Calm", null,
];

const healthAlerts = [
  null, null, null, null, null, // Most pets have none
  "Sensitive skin — avoid harsh shampoos",
  "Ear infection prone — dry ears thoroughly",
  "Hip dysplasia — handle with care",
  "Anxious — needs slow approach",
  "Seizure history — avoid stress triggers",
  "Skin allergies — use hypoallergenic products only",
  "Aggressive when nails trimmed — muzzle required",
  "Heart murmur — monitor during grooming",
  "Diabetic — owner brings treats",
];

const streetNames = [
  "Main St", "Oak Ave", "Maple Dr", "Cedar Ln", "Elm St", "Pine Rd",
  "Birch Way", "Walnut Ct", "Cherry Blvd", "Willow Pl", "Spruce Ter",
  "Chestnut Cir", "Hickory Ln", "Magnolia Ave", "Sycamore Dr",
  "Dogwood Rd", "Aspen Way", "Redwood Ct", "Juniper Blvd", "Poplar St",
];

const cities = [
  "Springfield", "Riverside", "Fairview", "Madison", "Georgetown",
  "Clinton", "Salem", "Greenville", "Franklin", "Bristol",
  "Manchester", "Oakland", "Burlington", "Arlington", "Ashland",
];

const states = ["CA", "TX", "NY", "FL", "IL", "PA", "OH", "GA", "NC", "MI"];

const groomingNotes = [
  null, null, null,
  "Matting prone — brush out before bath",
  "Loves the dryer",
  "Nippy around paws",
  "Very calm, easy to handle",
  "Needs extra time for drying (thick coat)",
  "Sensitive around face — use caution",
  "Doesn't like water, use minimal bath time",
  "Loves belly rubs — great way to calm down",
  "Double coat — needs thorough de-shedding",
  "Previous clipper burn — be gentle on belly",
];

const appointmentNotes = [
  null, null, null, null,
  "Client requested extra brushing",
  "Nail trim only — no bath",
  "Teeth brushing added",
  "Ear cleaning requested",
  "New puppy — first groom, be gentle",
  "Matted — may need extra time",
  "Owner wants shorter cut than usual",
  "Anal glands need expressing",
  "Use gentle shampoo per vet recommendation",
  "Client running late, pushed start by 15min",
];

const visitLogNotes = [
  null, null,
  "Coat in great condition",
  "Found a small mat behind left ear, brushed out",
  "Nails were very long, trimmed carefully",
  "Light shedding, used de-shedding tool",
  "Slight skin irritation noticed on belly — flagged to owner",
  "Pet was very well-behaved today",
  "Required two rinse cycles — very dirty",
  "Applied conditioning treatment for dry coat",
];

const productsUsed = [
  null,
  "Oatmeal shampoo, conditioner",
  "Whitening shampoo, detangler",
  "De-shedding shampoo, FURminator",
  "Hypoallergenic shampoo, ear cleaner",
  "Flea & tick shampoo, nail grinder",
  "Puppy shampoo, gentle conditioner",
  "Medicated shampoo (vet prescribed), moisturizer",
  "Coconut oil shampoo, leave-in conditioner, cologne",
];

const demoPetImages = [
  "/demo-pets/dog-golden-after.png",
  "/demo-pets/dog-poodle-groomed.png",
  "/demo-pets/dog-black-lab.png",
  "/demo-pets/dog-shih-tzu.png",
  "/demo-pets/dog-cocker-spaniel.png",
  "/demo-pets/dog-schnauzer.png",
  "/demo-pets/dog-maltese.png",
  "/demo-pets/dog-dachshund.png",
  "/demo-pets/dog-pomeranian.png",
  "/demo-pets/dog-bichon-frise.png",
  "/demo-pets/dog-golden-retriever.png",
  "/demo-pets/dog-labrador.png",
  "/demo-pets/dog-mixed-breed.png",
  "/demo-pets/dog-poodle.png",
  "/demo-pets/dog-terrier.png",
  "/demo-pets/dog-afghan-hound.png",
  "/demo-pets/dog-basset-brown-white.png",
  "/demo-pets/dog-bichon-white-groomed.png",
  "/demo-pets/dog-boxer-fawn-athletic.png",
  "/demo-pets/dog-cavalier-cream-gentle.png",
  "/demo-pets/dog-cocker-buff-friendly.png",
  "/demo-pets/dog-corgi.png",
  "/demo-pets/dog-dachshund-black-tan.png",
  "/demo-pets/dog-golden-before.png",
  "/demo-pets/dog-pomeranian-white-studio.png",
  "/demo-pets/dog-schnauzer-black-groomed.png",
  "/demo-pets/dog-setter-red-sunlit.png",
  "/demo-pets/dog-sheepdog-merle-running.png",
];

const puggleImages = [
  "/demo-pets/dog-puggle-fawn-playful.png",
  "/demo-pets/dog-puggle-black-sitting.png",
  "/demo-pets/dog-puggle-cream-groomed.png",
  "/demo-pets/dog-puggle-fawn-grooming.png",
];

// ── Service definitions ──────────────────────────────────────────────────────
// Deterministic service IDs + UNIQUE(name) constraint make seed fully idempotent:
// first run inserts, subsequent runs update existing rows via ON CONFLICT (name).
const servicesDef = [
  { id: "b0000001-0000-0000-0000-000000000001", name: "Bath & Brush", desc: "Full bath, blow-dry, brush out, and ear cleaning", price: 4500, dur: 45 },
  { id: "b0000001-0000-0000-0000-000000000002", name: "Full Groom — Small", desc: "Complete grooming for dogs under 25 lbs", price: 6500, dur: 60 },
  { id: "b0000001-0000-0000-0000-000000000003", name: "Full Groom — Medium", desc: "Complete grooming for dogs 25-50 lbs", price: 8000, dur: 75 },
  { id: "b0000001-0000-0000-0000-000000000004", name: "Full Groom — Large", desc: "Complete grooming for dogs over 50 lbs", price: 9500, dur: 90 },
  { id: "b0000001-0000-0000-0000-000000000005", name: "Nail Trim", desc: "Nail clipping and filing", price: 1500, dur: 15 },
  { id: "b0000001-0000-0000-0000-000000000006", name: "Teeth Brushing", desc: "Dental cleaning with enzymatic toothpaste", price: 1000, dur: 10 },
  { id: "b0000001-0000-0000-0000-000000000007", name: "De-shedding Treatment", desc: "Specialised de-shedding bath and blowout", price: 5500, dur: 60 },
  { id: "b0000001-0000-0000-0000-000000000008", name: "Puppy First Groom", desc: "Gentle introduction to grooming for puppies under 6 months", price: 4000, dur: 30 },
  { id: "b0000001-0000-0000-0000-000000000009", name: "Flea & Tick Treatment", desc: "Medicated bath with flea and tick shampoo", price: 5000, dur: 45 },
  { id: "b0000001-0000-0000-0000-00000000000a", name: "Sanitary Trim", desc: "Hygienic trim of paw pads, face, and sanitary areas", price: 2500, dur: 20 },
];

// ── Known-users-only seed (prod/demo) ───────────────────────────────────────

/**
 * Seeds only the minimal known users for prod/demo environments.
 * Creates: Demo Manager staff + Demo Client + Demo Dog + basic services.
 * Idempotent: skips creation if records already exist.
 */
async function seedKnownUsers() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });

  console.log("Seeding known users (prod/demo mode)...\n");

  const KNOWN_STAFF_ID = "00000000-0000-0000-0000-000000000001";
  const DEMO_CLIENT_ID = "00000000-0000-0000-0000-000000000002";
  const DEMO_PET_ID = "00000000-0000-0000-0000-000000000003";

  // ── Staff: Demo Manager ──
  const [existingStaff] = await db
    .select()
    .from(schema.staff)
    .where(eq(schema.staff.email, "demo-manager@groombook.dev"))
    .limit(1);

  if (existingStaff) {
    console.log(`✓ Staff '${existingStaff.name}' already exists — skipping`);
  } else {
    await db.insert(schema.staff).values({
      id: KNOWN_STAFF_ID,
      name: "Demo Manager",
      email: "demo-manager@groombook.dev",
      oidcSub: "demo-manager-001",
      role: "manager",
      isSuperUser: true,
      active: true,
    });
    console.log("✓ Created staff 'Demo Manager' (oidcSub: demo-manager-001)");
  }

  // ── Staff: SEED_ADMIN_EMAIL admin ──
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";
    const ADMIN_STAFF_ID = "00000000-0000-0000-0000-000000000002";
    const [existingAdmin] = await db
      .select()
      .from(schema.staff)
      .where(eq(schema.staff.email, adminEmail))
      .limit(1);

    if (existingAdmin) {
      console.log(`✓ Staff admin '${existingAdmin.name}' already exists — skipping`);
    } else {
      await db.insert(schema.staff).values({
        id: ADMIN_STAFF_ID,
        name: adminName,
        email: adminEmail,
        oidcSub: adminEmail,
        role: "manager",
        isSuperUser: true,
        active: true,
      });
      console.log(`✓ Created staff admin '${adminName}' (${adminEmail})`);
    }
  }

  // ── Staff: UAT Super User (oidcSub from SEED_UAT_SUPER_OIDC_SUB env var) ──
  const uatSuperOidcSub = process.env.SEED_UAT_SUPER_OIDC_SUB;
  if (uatSuperOidcSub) {
    const UAT_SUPER_STAFF_ID = "00000000-0000-0000-0000-000000000003";
    const [existingUatSuper] = await db
      .select()
      .from(schema.staff)
      .where(eq(schema.staff.email, "uat-super@groombook.dev"))
      .limit(1);

    if (existingUatSuper) {
      console.log(`✓ Staff 'UAT Super User' already exists — skipping`);
    } else {
      await db.insert(schema.staff).values({
        id: UAT_SUPER_STAFF_ID,
        name: "UAT Super User",
        email: "uat-super@groombook.dev",
        oidcSub: uatSuperOidcSub,
        role: "manager",
        isSuperUser: true,
        active: true,
      });
      console.log(`✓ Created staff 'UAT Super User' (oidcSub: ${uatSuperOidcSub})`);
    }
  }

  // ── Staff: UAT Staff Groomer (oidcSub from SEED_UAT_STAFF_OIDC_SUB env var) ──
  const uatStaffOidcSub = process.env.SEED_UAT_STAFF_OIDC_SUB;
  if (uatStaffOidcSub) {
    const UAT_STAFF_STAFF_ID = "00000000-0000-0000-0000-000000000004";
    const [existingUatStaff] = await db
      .select()
      .from(schema.staff)
      .where(eq(schema.staff.email, "uat-groomer@groombook.dev"))
      .limit(1);

    if (existingUatStaff) {
      console.log(`✓ Staff 'UAT Staff Groomer' already exists — skipping`);
    } else {
      await db.insert(schema.staff).values({
        id: UAT_STAFF_STAFF_ID,
        name: "UAT Staff Groomer",
        email: "uat-groomer@groombook.dev",
        oidcSub: uatStaffOidcSub,
        role: "groomer",
        isSuperUser: false,
        active: true,
      });
      console.log(`✓ Created staff 'UAT Staff Groomer' (oidcSub: ${uatStaffOidcSub})`);
    }
  }

  // ── Staff: UAT Groomer Personas (SEED_UAT_GROOMER_EMAILS + SEED_UAT_GROOMER_NAMES) ──
  const groomerEmails = process.env.SEED_UAT_GROOMER_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  const groomerNames = process.env.SEED_UAT_GROOMER_NAMES?.split(",").map((n) => n.trim()).filter(Boolean) ?? [];
  const groomerCount = Math.min(groomerEmails.length, groomerNames.length);
  for (let i = 0; i < groomerCount; i++) {
    const email = groomerEmails[i]!;
    const name = groomerNames[i]!;
    // Use deterministic IDs in the 00000000-0000-0000-0000-000000000005+ range
    const staffId = `00000000-0000-0000-0000-${String(5 + i).padStart(12, "0")}`;
    const [existingGroomer] = await db
      .select()
      .from(schema.staff)
      .where(eq(schema.staff.email, email))
      .limit(1);

    if (existingGroomer) {
      console.log(`✓ Staff groomer '${existingGroomer.name}' already exists — skipping`);
    } else {
      await db.insert(schema.staff).values({
        id: staffId,
        name,
        email,
        oidcSub: email,
        role: "groomer",
        isSuperUser: false,
        active: true,
      });
      console.log(`✓ Created staff groomer '${name}' (${email})`);
    }
  }

  // ── Services: idempotent upsert using name as unique key ─────────────────────
  // UNIQUE constraint on services.name (migration 0020) must exist first.
  // Uses b0000001-... IDs to match main seed servicesDef for same-named services.
  const demoSvcs = [
    { id: "b0000001-0000-0000-0000-000000000001", name: "Bath & Brush", description: "Full bath, blow-dry, brush out, and ear cleaning", basePriceCents: 4500, durationMinutes: 45 },
    { id: "b0000001-0000-0000-0000-000000000002", name: "Full Groom — Small", description: "Complete grooming for dogs under 25 lbs", basePriceCents: 6500, durationMinutes: 60 },
    { id: "b0000001-0000-0000-0000-000000000003", name: "Full Groom — Medium", description: "Complete grooming for dogs 25-50 lbs", basePriceCents: 8000, durationMinutes: 75 },
    { id: "b0000001-0000-0000-0000-000000000004", name: "Nail Trim", description: "Nail clipping and filing", basePriceCents: 1500, durationMinutes: 15 },
  ];
  for (const svc of demoSvcs) {
    await db.insert(schema.services)
      .values({ ...svc, active: true })
      .onConflictDoUpdate({
        target: schema.services.name,
        set: { description: svc.description, basePriceCents: svc.basePriceCents, durationMinutes: svc.durationMinutes, active: true },
      });
  }
  console.log(`✓ Seeded ${demoSvcs.length} services`);

  // ── Client: Demo Client ──
  const [existingClient] = await db
    .select()
    .from(schema.clients)
    .where(eq(schema.clients.email, "demo-client@example.com"))
    .limit(1);

  let clientId: string;
  if (existingClient) {
    clientId = existingClient.id;
    console.log(`✓ Client '${existingClient.name}' already exists — skipping`);
  } else {
    const [created] = await db
      .insert(schema.clients)
      .values({
        id: DEMO_CLIENT_ID,
        name: "Demo Client",
        email: "demo-client@example.com",
        phone: "555-0001",
        address: "1 Demo Street, Demo City, CA 90210",
      })
      .returning();
    clientId = created!.id;
    console.log("✓ Created client 'Demo Client'");
  }

  // ── Pets: Demo Dogs & Cats ──
  const demoPets = [
    { id: DEMO_PET_ID, name: "Demo Dog", species: "Dog", breed: "Golden Retriever", weight: "30.00", dob: "2020-06-15", image: "/demo-pets/dog-golden-after.png" },
    { id: uuid(), name: "Fluffy", species: "Dog", breed: "Poodle", weight: "8.50", dob: "2019-03-22", image: "/demo-pets/dog-poodle-groomed.png" },
    { id: uuid(), name: "Shadow", species: "Dog", breed: "Black Labrador", weight: "35.00", dob: "2018-11-10", image: "/demo-pets/dog-black-lab.png" },
    { id: uuid(), name: "Bella", species: "Dog", breed: "Shih Tzu", weight: "4.50", dob: "2021-02-14", image: "/demo-pets/dog-shih-tzu.png" },
    { id: uuid(), name: "Max", species: "Dog", breed: "Cocker Spaniel", weight: "15.00", dob: "2019-07-08", image: "/demo-pets/dog-cocker-spaniel.png" },
    { id: uuid(), name: "Buddy", species: "Dog", breed: "Schnauzer", weight: "12.00", dob: "2020-05-20", image: "/demo-pets/dog-schnauzer.png" },
    { id: uuid(), name: "Daisy", species: "Dog", breed: "Maltese", weight: "3.50", dob: "2021-09-03", image: "/demo-pets/dog-maltese.png" },
    { id: uuid(), name: "Charlie", species: "Dog", breed: "Dachshund", weight: "6.00", dob: "2020-01-15", image: "/demo-pets/dog-dachshund.png" },
    { id: uuid(), name: "Lucy", species: "Dog", breed: "Pomeranian", weight: "2.50", dob: "2022-04-10", image: "/demo-pets/dog-pomeranian.png" },
  ];

  for (const pet of demoPets) {
    const [existing] = await db
      .select()
      .from(schema.pets)
      .where(eq(schema.pets.id, pet.id))
      .limit(1);

    if (existing) {
      console.log(`✓ Pet '${existing.name}' already exists — skipping`);
    } else {
      await db.insert(schema.pets).values({
        id: pet.id,
        clientId,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        weightKg: pet.weight,
        dateOfBirth: new Date(`${pet.dob}T00:00:00Z`),
        image: pet.image,
      });
      console.log(`✓ Created pet '${pet.name}'`);
    }
  }

  console.log("\nKnown-users seed complete!");
  await client.end();
}

// ── Main seed ────────────────────────────────────────────────────────────────

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  if (process.env.SEED_KNOWN_USERS_ONLY === "true") {
    await seedKnownUsers();
    return;
  }

  const profile = getProfile();
  const cfg = profiles[profile];
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });

  console.log(`Seeding Groom Book database (profile: ${profile})...\n`);

  // ── Staff ──
  const managerStaff = Array.from({ length: cfg.staffCount.manager }, (_, i) =>
    ({ id: uuid(), name: `Manager ${i + 1}`, email: `manager${i + 1}@groombook.dev`, role: "manager" as const, isSuperUser: profile === "uat" && i === 0 })
  );
  const receptionistStaff = Array.from({ length: cfg.staffCount.receptionist }, (_, i) =>
    ({ id: uuid(), name: `Receptionist ${i + 1}`, email: `receptionist${i + 1}@groombook.dev`, role: "receptionist" as const, isSuperUser: false })
  );
  const groomers = Array.from({ length: cfg.staffCount.groomer }, (_, i) =>
    ({ id: uuid(), name: `Groomer ${i + 1}`, email: `groomer${i + 1}@groombook.dev`, role: "groomer" as const, isSuperUser: false })
  );
  const bathers = Array.from({ length: cfg.staffCount.bather }, (_, i) =>
    ({ id: uuid(), name: `Bather ${i + 1}`, email: `bather${i + 1}@groombook.dev`, role: "groomer" as const, isSuperUser: false })
  );

  await db.execute(sql`TRUNCATE impersonation_sessions, impersonation_audit_logs, appointments, invoices, invoice_line_items, invoice_tip_splits, grooming_visit_logs CASCADE`);

  const allStaff = [...managerStaff, ...receptionistStaff, ...groomers, ...bathers];
  for (const s of allStaff) {
    await db.insert(schema.staff)
      .values({
        id: s.id,
        name: s.name,
        email: s.email,
        role: s.role,
        isSuperUser: s.isSuperUser,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.staff.email,
        set: { id: s.id, name: s.name, role: s.role, isSuperUser: s.isSuperUser, active: true },
      });
  }
  const staffLabel = cfg.staffCount.bather > 0
    ? `${allStaff.length} staff (${cfg.staffCount.manager} manager, ${cfg.staffCount.receptionist} receptionist, ${cfg.staffCount.groomer} groomers, ${cfg.staffCount.bather} bathers)`
    : `${allStaff.length} staff (${cfg.staffCount.manager} manager, ${cfg.staffCount.receptionist} receptionist, ${cfg.staffCount.groomer} groomers)`;
  console.log(`✓ Created ${staffLabel}`);

  // ── SEED_ADMIN_EMAIL admin ──
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";
    const ADMIN_STAFF_ID = "00000000-0000-0000-0000-000000000002";
    await db.insert(schema.staff)
      .values({
        id: ADMIN_STAFF_ID,
        name: adminName,
        email: adminEmail,
        oidcSub: adminEmail,
        role: "manager",
        isSuperUser: true,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.staff.email,
        set: { id: ADMIN_STAFF_ID, name: adminName, role: "manager", isSuperUser: true, active: true },
      });
    console.log(`✓ Upserted admin staff '${adminName}' (${adminEmail})`);
  }

  // ── UAT Groomer Personas (SEED_UAT_GROOMER_EMAILS + SEED_UAT_GROOMER_NAMES) ──
  const groomerEmails = process.env.SEED_UAT_GROOMER_EMAILS?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  const groomerNames = process.env.SEED_UAT_GROOMER_NAMES?.split(",").map((n) => n.trim()).filter(Boolean) ?? [];
  const groomerCount = Math.min(groomerEmails.length, groomerNames.length);
  for (let i = 0; i < groomerCount; i++) {
    const email = groomerEmails[i]!;
    const name = groomerNames[i]!;
    const staffId = `00000000-0000-0000-0000-${String(5 + i).padStart(12, "0")}`;
    await db.insert(schema.staff)
      .values({
        id: staffId,
        name,
        email,
        oidcSub: email,
        role: "groomer",
        isSuperUser: false,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.staff.email,
        set: { id: staffId, name, role: "groomer", isSuperUser: false, active: true },
      });
    console.log(`✓ Upserted groomer '${name}' (${email})`);
  }

  // ── Services ──
  // Upsert services using name as unique key. With deterministic IDs in
  // servicesDef and TRUNCATE clearing downstream tables first, this is
  // idempotent: first run inserts, subsequent runs update existing rows.
  const serviceIds: string[] = [];
  for (const s of servicesDef) {
    serviceIds.push(s.id);
    await db.insert(schema.services)
      .values({
        id: s.id,
        name: s.name,
        description: s.desc,
        basePriceCents: s.price,
        durationMinutes: s.dur,
        active: true,
      })
      .onConflictDoUpdate({
        target: schema.services.name,
        set: { description: s.desc, basePriceCents: s.price, durationMinutes: s.dur, active: true },
      });
  }
  console.log(`✓ Created ${servicesDef.length} services`);

  // ── Clients & Pets ──
  const now = new Date();
  const appointmentsBackDate = new Date(now);
  appointmentsBackDate.setDate(appointmentsBackDate.getDate() - cfg.appointmentsBackDays);
  const appointmentsForwardDate = new Date(now);
  appointmentsForwardDate.setDate(appointmentsForwardDate.getDate() + cfg.appointmentsForwardDays);

  interface ClientRecord { id: string; name: string }
  interface PetRecord { id: string; clientId: string }

  const clientRecords: ClientRecord[] = [];
  const petRecords: PetRecord[] = [];

  let petIndex = 0; // Track pet count to assign Puggle images to first 250 pets
  const clientBatchSize = 50;
  for (let batch = 0; batch < Math.ceil(cfg.clientCount / clientBatchSize); batch++) {
    const clientBatch: (typeof schema.clients.$inferInsert)[] = [];
    const petBatch: (typeof schema.pets.$inferInsert)[] = [];

    for (let i = 0; i < clientBatchSize; i++) {
      const clientId = uuid();
      const first = pick(firstNames);
      const last = pick(lastNames);
      const name = `${first} ${last}`;
      const emailDomain = pick(["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com"]);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${randInt(1, 99)}@${emailDomain}`;
      const phone = `(${randInt(200, 999)}) ${randInt(200, 999)}-${String(randInt(1000, 9999))}`;
      const addr = `${randInt(100, 9999)} ${pick(streetNames)}, ${pick(cities)}, ${pick(states)} ${String(randInt(10000, 99999))}`;

      clientBatch.push({
        id: clientId,
        name,
        email,
        phone,
        address: addr,
        notes: rand() < 0.2 ? pick(["Prefers morning appointments", "Always pays cash", "VIP client", "Referred by a friend", "Has multiple pets — check all in"]) : null,
        emailOptOut: rand() < 0.1,
      });

      clientRecords.push({ id: clientId, name });

      // 1-3 pets per client
      const petCount = rand() < 0.5 ? 1 : rand() < 0.7 ? 2 : 3;
      for (let p = 0; p < petCount; p++) {
        const petId = uuid();
        const breed = petIndex < 250 ? "Puggle" : pick(dogBreeds);
        const dob = new Date(now);
        dob.setFullYear(dob.getFullYear() - randInt(1, 14));
        dob.setMonth(randInt(0, 11));

        petBatch.push({
          id: petId,
          clientId,
          name: pick(dogNames),
          species: "Dog",
          breed,
          weightKg: String(randInt(3, 60) + rand().toFixed(1).slice(1)),
          dateOfBirth: dob,
          healthAlerts: pick(healthAlerts),
          groomingNotes: pick(groomingNotes),
          cutStyle: pick(cutStyles),
          shampooPreference: pick(shampoos),
          specialCareNotes: rand() < 0.1 ? "Vet clearance required before grooming" : null,
          customFields: {},
          image: petIndex < 250 ? pick(puggleImages) : pick(demoPetImages),
        });

        petRecords.push({ id: petId, clientId });
        petIndex++;
      }
    }

    for (const client of clientBatch) {
      await db.insert(schema.clients)
        .values(client)
        .onConflictDoUpdate({
          target: schema.clients.id,
          set: { name: client.name, email: client.email, phone: client.phone, address: client.address, notes: client.notes, emailOptOut: client.emailOptOut },
        });
    }

    for (const pet of petBatch) {
      await db.insert(schema.pets)
        .values(pet)
        .onConflictDoUpdate({
          target: schema.pets.id,
          set: {
            clientId: pet.clientId,
            name: pet.name,
            species: pet.species,
            breed: pet.breed,
            weightKg: pet.weightKg,
            dateOfBirth: pet.dateOfBirth,
            healthAlerts: pet.healthAlerts,
            groomingNotes: pet.groomingNotes,
            cutStyle: pet.cutStyle,
            shampooPreference: pet.shampooPreference,
            specialCareNotes: pet.specialCareNotes,
            customFields: pet.customFields,
            image: pet.image,
          },
        });
    }
  }

  console.log(`✓ Created ${cfg.clientCount} clients with ${petRecords.length} pets`);

  // ── UAT test clients (guaranteed pending invoices) ─────────────────────────────
  // These 5 clients are deterministic and documented in Shedward AGENTS.md so
  // UAT can reliably find billing test data without searching.
  if (cfg.includeUatClients) {
    interface UatClient {
      id: string;
      name: string;
      email: string;
      phone: string;
      address: string;
      petId: string;
      petName: string;
      petBreed: string;
    }
    const uatClients: UatClient[] = [
    { id: uuid(), name: "UAT Test Alpha", email: "uat-alpha@groombook.dev", phone: "(555) 100-0001", address: "100 Test Lane, Springfield, CA 90210", petId: uuid(), petName: "TestBuddy", petBreed: "Golden Retriever" },
    { id: uuid(), name: "UAT Test Bravo", email: "uat-bravo@groombook.dev", phone: "(555) 100-0002", address: "200 Test Lane, Springfield, CA 90210", petId: uuid(), petName: "TestMax", petBreed: "Labrador Retriever" },
    { id: uuid(), name: "UAT Test Charlie", email: "uat-charlie@groombook.dev", phone: "(555) 100-0003", address: "300 Test Lane, Springfield, CA 90210", petId: uuid(), petName: "TestCooper", petBreed: "Poodle" },
    { id: uuid(), name: "UAT Test Delta", email: "uat-delta@groombook.dev", phone: "(555) 100-0004", address: "400 Test Lane, Springfield, CA 90210", petId: uuid(), petName: "TestRocky", petBreed: "French Bulldog" },
    { id: uuid(), name: "UAT Test Echo", email: "uat-echo@groombook.dev", phone: "(555) 100-0005", address: "500 Test Lane, Springfield, CA 90210", petId: uuid(), petName: "TestDuke", petBreed: "Beagle" },
  ];

  for (const uc of uatClients) {
    await db.insert(schema.clients)
      .values({ id: uc.id, name: uc.name, email: uc.email, phone: uc.phone, address: uc.address })
      .onConflictDoUpdate({ target: schema.clients.id, set: { name: uc.name, email: uc.email, phone: uc.phone, address: uc.address } });
    await db.insert(schema.pets)
      .values({ id: uc.petId, clientId: uc.id, name: uc.petName, species: "Dog", breed: uc.petBreed, weightKg: "25.00", dateOfBirth: new Date("2021-03-15T00:00:00Z"), image: pick(demoPetImages) })
      .onConflictDoUpdate({ target: schema.pets.id, set: { clientId: uc.id, name: uc.petName, species: "Dog", breed: uc.petBreed, weightKg: "25.00", dateOfBirth: new Date("2021-03-15T00:00:00Z"), image: pick(demoPetImages) } });
    // Create one completed appointment for this client
    const apptId = uuid();
    const svcIdx = 0;
    const svc = servicesDef[svcIdx]!;
    const completedTime = randDate(appointmentsBackDate, now);
    completedTime.setHours(randInt(8, 16), pick([0, 15, 30, 45]), 0, 0);
    const endTime = new Date(completedTime.getTime() + svc.dur * 60 * 1000);
    const uatGroomer = groomers[0]!;
    const uatBather = bathers.length > 0 ? bathers[0]! : uatGroomer;
    await db.insert(schema.appointments).values({
      id: apptId, clientId: uc.id, petId: uc.petId, serviceId: serviceIds[svcIdx]!, staffId: uatGroomer.id,
      batherStaffId: uatBather.id, status: "completed" as const, startTime: completedTime, endTime, notes: null, priceCents: svc.price,
    });
    // Create a PENDING invoice for that appointment
    const invoiceId = uuid();
    const taxCents = Math.round(svc.price * 0.08);
    const totalCents = svc.price + taxCents;
    await db.insert(schema.invoices).values({
      id: invoiceId, appointmentId: apptId, clientId: uc.id, subtotalCents: svc.price,
      taxCents, tipCents: 0, totalCents, status: "pending" as const,
      paymentMethod: null, paidAt: null, notes: null,
    });
    await db.insert(schema.invoiceLineItems).values({
      id: uuid(), invoiceId, description: svc.name, quantity: 1, unitPriceCents: svc.price, totalCents: svc.price,
    });
    await db.insert(schema.groomingVisitLogs).values({
      id: uuid(), petId: uc.petId, appointmentId: apptId, staffId: groomers[0]!.id,
      cutStyle: null, productsUsed: null, notes: null, groomedAt: endTime,
    });
    }
    console.log(`✓ Created ${uatClients.length} UAT test clients with guaranteed pending invoices`);
  }

  // ── Appointments, Invoices, Visit Logs ──
  // Generate ~5 appointments per client on average = ~2500 total
  const statuses: (typeof schema.appointmentStatusEnum.enumValues)[number][] = [
    "completed", "completed", "completed", "completed", "completed",
    "completed", "completed", "scheduled", "confirmed", "cancelled", "no_show",
  ];

  let appointmentCount = 0;
  let invoiceCount = 0;
  let visitLogCount = 0;
  let paidInvoiceCounter = 0;

  // Process in batches per client to keep memory manageable
  const apptBatchSize = 100;
  let apptBatch: (typeof schema.appointments.$inferInsert)[] = [];
  let invoiceBatch: (typeof schema.invoices.$inferInsert)[] = [];
  let lineItemBatch: (typeof schema.invoiceLineItems.$inferInsert)[] = [];
  let tipSplitBatch: (typeof schema.invoiceTipSplits.$inferInsert)[] = [];
  let visitLogBatch: (typeof schema.groomingVisitLogs.$inferInsert)[] = [];

  async function flushBatches() {
    if (apptBatch.length > 0) {
      await db.insert(schema.appointments).values(apptBatch);
      apptBatch = [];
    }
    if (invoiceBatch.length > 0) {
      await db.insert(schema.invoices).values(invoiceBatch);
      invoiceBatch = [];
    }
    if (lineItemBatch.length > 0) {
      await db.insert(schema.invoiceLineItems).values(lineItemBatch);
      lineItemBatch = [];
    }
    if (tipSplitBatch.length > 0) {
      await db.insert(schema.invoiceTipSplits).values(tipSplitBatch);
      tipSplitBatch = [];
    }
    if (visitLogBatch.length > 0) {
      await db.insert(schema.groomingVisitLogs).values(visitLogBatch);
      visitLogBatch = [];
    }
  }

  // Group pets by client for efficient appointment generation
  const petsByClient = new Map<string, string[]>();
  for (const pet of petRecords) {
    const arr = petsByClient.get(pet.clientId) ?? [];
    arr.push(pet.id);
    petsByClient.set(pet.clientId, arr);
  }

  for (const client of clientRecords) {
    const pets = petsByClient.get(client.id) ?? [];
    // Each client visits ~3-8 times over the year
    const visitCount = randInt(3, 8);

    for (let v = 0; v < visitCount; v++) {
      // Pick a random pet for this visit
      const petId = pick(pets);
      const serviceIdx = randInt(0, serviceIds.length - 1);
      const serviceId = serviceIds[serviceIdx]!;
      const svc = servicesDef[serviceIdx]!;
      const groomer = pick(groomers);
      const bather = rand() < 0.6 ? pick(bathers) : null;
      const status = pick(statuses);

      // Schedule within the configured appointment window
      let startTime: Date;
      if (status === "scheduled" || status === "confirmed") {
        startTime = randDate(now, appointmentsForwardDate);
      } else {
        startTime = randDate(appointmentsBackDate, now);
      }
      // Snap to business hours (8am - 5pm)
      startTime.setHours(randInt(8, 16), pick([0, 15, 30, 45]), 0, 0);
      const endTime = new Date(startTime.getTime() + svc.dur * 60 * 1000);

      const apptId = uuid();
      const priceCents = rand() < 0.2 ? svc.price + randInt(-500, 1000) : null;
      const effectivePrice = priceCents ?? svc.price;

      apptBatch.push({
        id: apptId,
        clientId: client.id,
        petId,
        serviceId,
        staffId: groomer.id,
        batherStaffId: bather?.id ?? null,
        status,
        startTime,
        endTime,
        notes: pick(appointmentNotes),
        priceCents,
      });
      appointmentCount++;

      // Create invoice for completed appointments
      if (status === "completed") {
        const invoiceId = uuid();
        const tipCents = rand() < 0.7 ? randInt(200, 3000) : 0;
        const taxCents = Math.round(effectivePrice * 0.08);
        const totalCents = effectivePrice + taxCents + tipCents;

        const invoiceStatus = rand() < 0.95 ? "paid" as const : "pending" as const;
        const paidAt = invoiceStatus === "paid" ? new Date(endTime.getTime() + randInt(5, 30) * 60 * 1000) : null;
        paidInvoiceCounter++;
        const stripePaymentIntentId = invoiceStatus === "paid"
          ? `pi_test_seed_${String(paidInvoiceCounter).padStart(6, "0")}`
          : null;

        invoiceBatch.push({
          id: invoiceId,
          appointmentId: apptId,
          clientId: client.id,
          subtotalCents: effectivePrice,
          taxCents,
          tipCents,
          totalCents,
          status: invoiceStatus,
          paymentMethod: invoiceStatus === "paid" ? pick(["cash", "card", "card", "card", "check"]) as "cash" | "card" | "check" : null,
          paidAt,
          stripePaymentIntentId,
          notes: rand() < 0.05 ? "Added extra service at checkout" : null,
        });

        // Line item
        lineItemBatch.push({
          id: uuid(),
          invoiceId,
          description: svc.name,
          quantity: 1,
          unitPriceCents: effectivePrice,
          totalCents: effectivePrice,
        });

        // Tip splits for paid invoices with tips
        if (tipCents > 0 && invoiceStatus === "paid") {
          if (bather) {
            // 60/40 split groomer/bather
            const groomerShare = Math.round(tipCents * 0.6);
            const batherShare = tipCents - groomerShare;
            tipSplitBatch.push(
              { id: uuid(), invoiceId, staffId: groomer.id, staffName: groomer.name, sharePct: "60.00", shareCents: groomerShare },
              { id: uuid(), invoiceId, staffId: bather.id, staffName: bather.name, sharePct: "40.00", shareCents: batherShare },
            );
          } else {
            tipSplitBatch.push({
              id: uuid(), invoiceId, staffId: groomer.id, staffName: groomer.name, sharePct: "100.00", shareCents: tipCents,
            });
          }
        }

        invoiceCount++;

        // Visit log
        visitLogBatch.push({
          id: uuid(),
          petId,
          appointmentId: apptId,
          staffId: groomer.id,
          cutStyle: pick(cutStyles),
          productsUsed: pick(productsUsed),
          notes: pick(visitLogNotes),
          groomedAt: endTime,
        });
        visitLogCount++;
      }

      // Flush periodically
      if (apptBatch.length >= apptBatchSize) {
        await flushBatches();
      }
    }
  }

  // Final flush
  await flushBatches();

  console.log(`✓ Created ${appointmentCount} appointments`);
  console.log(`✓ Created ${invoiceCount} invoices with line items and tip splits`);

  // ── Enforce target invoice count ───────────────────────────────────────────
  // If current invoice count is below target (due to profile having fewer
  // clients/appointments than the target ratio), generate supplemental
  // completed appointments for existing clients to fill the gap.
  if (invoiceCount < cfg.invoiceCount) {
    const additionalNeeded = cfg.invoiceCount - invoiceCount;
    console.log(`  → Generating ${additionalNeeded} supplemental completed appointments to meet profile target...`);

    const existingClientIds = clientRecords.map(c => c.id);
    const apptsToGenerate = Math.min(additionalNeeded, existingClientIds.length * 20);
    let supplementalCount = 0;
    let supplementalInvoices = 0;

    for (let i = 0; i < apptsToGenerate && supplementalInvoices < additionalNeeded; i++) {
      const clientId = pick(existingClientIds);
      const pets = petsByClient.get(clientId) ?? [];
      if (pets.length === 0) continue;

      const petId = pick(pets);
      const serviceIdx = randInt(0, serviceIds.length - 1);
      const serviceId = serviceIds[serviceIdx]!;
      const svc = servicesDef[serviceIdx]!;
      const groomer = pick(groomers);
      const bather = bathers.length > 0 && rand() < 0.6 ? pick(bathers) : null;

      let startTime = randDate(appointmentsBackDate, now);
      startTime.setHours(randInt(8, 16), pick([0, 15, 30, 45]), 0, 0);
      const endTime = new Date(startTime.getTime() + svc.dur * 60 * 1000);
      const effectivePrice = svc.price;

      const apptId = uuid();
      apptBatch.push({
        id: apptId, clientId, petId, serviceId,
        staffId: groomer.id, batherStaffId: bather?.id ?? null,
        status: "completed", startTime, endTime, notes: null, priceCents: null,
      });
      appointmentCount++;
      supplementalCount++;

      const invoiceId = uuid();
      const tipCents = rand() < 0.7 ? randInt(200, 3000) : 0;
      const taxCents = Math.round(effectivePrice * 0.08);
      const totalCents = effectivePrice + taxCents + tipCents;
      const paidAt = new Date(endTime.getTime() + randInt(5, 30) * 60 * 1000);
      paidInvoiceCounter++;

      invoiceBatch.push({
        id: invoiceId, appointmentId: apptId, clientId,
        subtotalCents: effectivePrice, taxCents, tipCents, totalCents,
        status: "paid" as const,
        paymentMethod: pick(["cash", "card", "card", "card", "check"]) as "cash" | "card" | "check",
        paidAt,
        stripePaymentIntentId: `pi_test_seed_${String(paidInvoiceCounter).padStart(6, "0")}`,
        notes: null,
      });
      lineItemBatch.push({
        id: uuid(), invoiceId, description: svc.name, quantity: 1,
        unitPriceCents: effectivePrice, totalCents: effectivePrice,
      });
      if (tipCents > 0) {
        if (bather) {
          const groomerShare = Math.round(tipCents * 0.6);
          const batherShare = tipCents - groomerShare;
          tipSplitBatch.push(
            { id: uuid(), invoiceId, staffId: groomer.id, staffName: groomer.name, sharePct: "60.00", shareCents: groomerShare },
            { id: uuid(), invoiceId, staffId: bather.id, staffName: bather.name, sharePct: "40.00", shareCents: batherShare },
          );
        } else {
          tipSplitBatch.push({ id: uuid(), invoiceId, staffId: groomer.id, staffName: groomer.name, sharePct: "100.00", shareCents: tipCents });
        }
      }
      visitLogBatch.push({
        id: uuid(), petId, appointmentId: apptId, staffId: groomer.id,
        cutStyle: pick(cutStyles), productsUsed: pick(productsUsed),
        notes: pick(visitLogNotes), groomedAt: endTime,
      });
      invoiceCount++;
      supplementalInvoices++;
      visitLogCount++;

      if (apptBatch.length >= apptBatchSize) {
        await flushBatches();
      }
    }

    await flushBatches();
    console.log(`  → Added ${supplementalCount} supplemental appointments (${supplementalInvoices} invoices)`);
    console.log(`✓ Created ${invoiceCount} invoices with line items and tip splits`);
  }
  console.log(`✓ Created ${visitLogCount} grooming visit logs`);
  console.log("\nSeed complete!");

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
