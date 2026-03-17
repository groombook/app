/**
 * Seed script — generates realistic test data for Groom Book development.
 *
 * Creates:
 *  - 3 groomers + 3 bathers (staff)
 *  - 10 services
 *  - 500 clients, each with 1-3 dogs
 *  - ~2 500 appointments spread across the past 12 months
 *  - Invoices for completed appointments with line items and tip splits
 *  - Grooming visit logs for completed appointments
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx packages/db/src/seed.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

function uuid(): string {
  return crypto.randomUUID();
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
  "Pembroke Welsh Corgi", "French Bulldog", "Weimaraner",
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

// ── Service definitions ──────────────────────────────────────────────────────

const servicesDef = [
  { name: "Bath & Brush", desc: "Full bath, blow-dry, brush out, and ear cleaning", price: 4500, dur: 45 },
  { name: "Full Groom — Small", desc: "Complete grooming for dogs under 25 lbs", price: 6500, dur: 60 },
  { name: "Full Groom — Medium", desc: "Complete grooming for dogs 25-50 lbs", price: 8000, dur: 75 },
  { name: "Full Groom — Large", desc: "Complete grooming for dogs over 50 lbs", price: 9500, dur: 90 },
  { name: "Nail Trim", desc: "Nail clipping and filing", price: 1500, dur: 15 },
  { name: "Teeth Brushing", desc: "Dental cleaning with enzymatic toothpaste", price: 1000, dur: 10 },
  { name: "De-shedding Treatment", desc: "Specialised de-shedding bath and blowout", price: 5500, dur: 60 },
  { name: "Puppy First Groom", desc: "Gentle introduction to grooming for puppies under 6 months", price: 4000, dur: 30 },
  { name: "Flea & Tick Treatment", desc: "Medicated bath with flea and tick shampoo", price: 5000, dur: 45 },
  { name: "Sanitary Trim", desc: "Hygienic trim of paw pads, face, and sanitary areas", price: 2500, dur: 20 },
];

// ── Main seed ────────────────────────────────────────────────────────────────

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });

  console.log("Seeding Groom Book database...\n");

  // ── Staff ──
  const groomers = [
    { id: uuid(), name: "Sarah Mitchell", email: "sarah@groombook.dev", role: "groomer" as const },
    { id: uuid(), name: "James Park", email: "james@groombook.dev", role: "groomer" as const },
    { id: uuid(), name: "Maria Gonzalez", email: "maria@groombook.dev", role: "groomer" as const },
  ];

  // Bathers are groomers by role but serve as the secondary staff (bather) on appointments
  const bathers = [
    { id: uuid(), name: "Tyler Johnson", email: "tyler@groombook.dev", role: "groomer" as const },
    { id: uuid(), name: "Ashley Chen", email: "ashley@groombook.dev", role: "groomer" as const },
    { id: uuid(), name: "Devon Williams", email: "devon@groombook.dev", role: "groomer" as const },
  ];

  const allStaff = [...groomers, ...bathers];
  for (const s of allStaff) {
    await db.insert(schema.staff).values({
      id: s.id,
      name: s.name,
      email: s.email,
      role: s.role,
      active: true,
    });
  }
  console.log(`✓ Created ${allStaff.length} staff (3 groomers, 3 bathers)`);

  // ── Services ──
  const serviceIds: string[] = [];
  for (const s of servicesDef) {
    const id = uuid();
    serviceIds.push(id);
    await db.insert(schema.services).values({
      id,
      name: s.name,
      description: s.desc,
      basePriceCents: s.price,
      durationMinutes: s.dur,
      active: true,
    });
  }
  console.log(`✓ Created ${servicesDef.length} services`);

  // ── Clients & Pets ──
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  interface ClientRecord { id: string; name: string }
  interface PetRecord { id: string; clientId: string; name: string }

  const clientRecords: ClientRecord[] = [];
  const petRecords: PetRecord[] = [];

  // Batch insert clients and pets
  const clientBatchSize = 50;
  for (let batch = 0; batch < 500 / clientBatchSize; batch++) {
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
        notes: Math.random() < 0.2 ? pick(["Prefers morning appointments", "Always pays cash", "VIP client", "Referred by a friend", "Has multiple pets — check all in"]) : null,
        emailOptOut: Math.random() < 0.1,
      });

      clientRecords.push({ id: clientId, name });

      // 1-3 pets per client
      const petCount = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
      for (let p = 0; p < petCount; p++) {
        const petId = uuid();
        const breed = pick(dogBreeds);
        const dob = new Date(now);
        dob.setFullYear(dob.getFullYear() - randInt(1, 14));
        dob.setMonth(randInt(0, 11));

        petBatch.push({
          id: petId,
          clientId,
          name: pick(dogNames),
          species: "Dog",
          breed,
          weightKg: String(randInt(3, 60) + Math.random().toFixed(1).slice(1)),
          dateOfBirth: dob,
          healthAlerts: pick(healthAlerts),
          groomingNotes: pick(groomingNotes),
          cutStyle: pick(cutStyles),
          shampooPreference: pick(shampoos),
          specialCareNotes: Math.random() < 0.1 ? "Vet clearance required before grooming" : null,
          customFields: {},
        });

        petRecords.push({ id: petId, clientId, name: "" });
      }
    }

    await db.insert(schema.clients).values(clientBatch);
    await db.insert(schema.pets).values(petBatch);
  }

  console.log(`✓ Created 500 clients with ${petRecords.length} pets`);

  // ── Appointments, Invoices, Visit Logs ──
  // Generate ~5 appointments per client on average = ~2500 total
  const statuses: (typeof schema.appointmentStatusEnum.enumValues)[number][] = [
    "completed", "completed", "completed", "completed", "completed",
    "completed", "completed", "scheduled", "confirmed", "cancelled", "no_show",
  ];

  let appointmentCount = 0;
  let invoiceCount = 0;
  let visitLogCount = 0;

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
    const arr = petsByClient.get(pet.clientId) || [];
    arr.push(pet.id);
    petsByClient.set(pet.clientId, arr);
  }

  for (const client of clientRecords) {
    const pets = petsByClient.get(client.id) || [];
    // Each client visits ~3-8 times over the year
    const visitCount = randInt(3, 8);

    for (let v = 0; v < visitCount; v++) {
      // Pick a random pet for this visit
      const petId = pick(pets);
      const serviceIdx = randInt(0, serviceIds.length - 1);
      const serviceId = serviceIds[serviceIdx]!;
      const svc = servicesDef[serviceIdx]!;
      const groomer = pick(groomers);
      const bather = Math.random() < 0.6 ? pick(bathers) : null;
      const status = pick(statuses);

      // Schedule within the past year, or next 2 weeks for upcoming
      let startTime: Date;
      if (status === "scheduled" || status === "confirmed") {
        startTime = randDate(now, new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000));
      } else {
        startTime = randDate(oneYearAgo, now);
      }
      // Snap to business hours (8am - 5pm)
      startTime.setHours(randInt(8, 16), pick([0, 15, 30, 45]), 0, 0);
      const endTime = new Date(startTime.getTime() + svc.dur * 60 * 1000);

      const apptId = uuid();
      const priceCents = Math.random() < 0.2 ? svc.price + randInt(-500, 1000) : null;
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
        const tipCents = Math.random() < 0.7 ? randInt(200, 3000) : 0;
        const taxCents = Math.round(effectivePrice * 0.08);
        const totalCents = effectivePrice + taxCents + tipCents;

        const invoiceStatus = Math.random() < 0.95 ? "paid" as const : "pending" as const;
        const paidAt = invoiceStatus === "paid" ? new Date(endTime.getTime() + randInt(5, 30) * 60 * 1000) : null;

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
          notes: Math.random() < 0.05 ? "Added extra service at checkout" : null,
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
  console.log(`✓ Created ${visitLogCount} grooming visit logs`);
  console.log("\nSeed complete!");

  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
