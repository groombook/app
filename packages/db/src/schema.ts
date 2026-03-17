import {
  boolean,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "groomer",
  "receptionist",
  "manager",
]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "pending",
  "paid",
  "void",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "check",
  "other",
]);

// ─── Tables ───────────────────────────────────────────────────────────────────

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  // Set to true if the client has opted out of email reminders/notifications
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pets = pgTable("pets", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  species: text("species").notNull(),
  breed: text("breed"),
  weightKg: numeric("weight_kg", { precision: 5, scale: 2 }),
  dateOfBirth: timestamp("date_of_birth"),
  healthAlerts: text("health_alerts"),
  groomingNotes: text("grooming_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  basePriceCents: integer("base_price_cents").notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const staff = pgTable("staff", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  // oidcSub links to the Authentik OIDC subject claim
  oidcSub: text("oidc_sub").unique(),
  role: staffRoleEnum("role").notNull().default("groomer"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const recurringSeries = pgTable("recurring_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  // How many weeks between each appointment in the series
  frequencyWeeks: integer("frequency_weeks").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// appointmentGroups links multiple appointments from the same client visit.
// Each pet in the group gets its own appointment row with its own groomer.
export const appointmentGroups = pgTable("appointment_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  petId: uuid("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "restrict" }),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id, { onDelete: "restrict" }),
  staffId: uuid("staff_id").references(() => staff.id, {
    onDelete: "set null",
  }),
  status: appointmentStatusEnum("status").notNull().default("scheduled"),
  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  notes: text("notes"),
  // Override price at time of booking (null = use service base price)
  priceCents: integer("price_cents"),
  // Recurring series support
  seriesId: uuid("series_id").references(() => recurringSeries.id, {
    onDelete: "set null",
  }),
  seriesIndex: integer("series_index"),
  // Multi-pet group booking: links this appointment to others in the same visit
  groupId: uuid("group_id").references(() => appointmentGroups.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").references(() => appointments.id, {
    onDelete: "restrict",
  }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "restrict" }),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  tipCents: integer("tip_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  paymentMethod: paymentMethodEnum("payment_method"),
  paidAt: timestamp("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoiceLineItems = pgTable("invoice_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPriceCents: integer("unit_price_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Tracks which reminder emails have been sent per appointment (prevents duplicates).
// reminder_type values: "confirmation", "24h", "2h"
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    // "confirmation" | "24h" | "2h"
    reminderType: text("reminder_type").notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.appointmentId, t.reminderType)]
);
