import {
  boolean,
  index,
  integer,
  jsonb,
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

export const clientStatusEnum = pgEnum("client_status", [
  "active",
  "disabled",
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
  status: clientStatusEnum("status").notNull().default("active"),
  disabledAt: timestamp("disabled_at"),
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
  cutStyle: text("cut_style"),
  shampooPreference: text("shampoo_preference"),
  specialCareNotes: text("special_care_notes"),
  customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
  photoKey: text("photo_key"),
  photoUploadedAt: timestamp("photo_uploaded_at"),
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
  // Optional secondary staff (bather/assistant) for tip-split tracking
  batherStaffId: uuid("bather_staff_id").references(() => staff.id, {
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
  // Customer confirmation/cancellation tracking
  // Values: "pending" | "confirmed" | "cancelled"
  confirmationStatus: text("confirmation_status").notNull().default("pending"),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
  // Token for tokenized email confirm/cancel links (no auth required)
  confirmationToken: text("confirmation_token").unique(),
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

// Per-staff tip allocation calculated when an invoice is paid.
// staff_name is snapshotted at calculation time so reports remain accurate if staff is deleted.
export const invoiceTipSplits = pgTable("invoice_tip_splits", {
  id: uuid("id").primaryKey().defaultRandom(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
  staffName: text("staff_name").notNull(),
  sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
  shareCents: integer("share_cents").notNull(),
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

// ─── Impersonation ──────────────────────────────────────────────────────────

export const impersonationSessionStatusEnum = pgEnum(
  "impersonation_session_status",
  ["active", "ended", "expired"]
);

export const impersonationSessions = pgTable(
  "impersonation_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "restrict" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    reason: text("reason"),
    status: impersonationSessionStatusEnum("status")
      .notNull()
      .default("active"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("impersonation_sessions_staff_id_status_idx").on(t.staffId, t.status),
    index("impersonation_sessions_client_id_idx").on(t.clientId),
  ]
);

export const impersonationAuditLogs = pgTable(
  "impersonation_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => impersonationSessions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    pageVisited: text("page_visited"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("impersonation_audit_logs_session_id_idx").on(t.sessionId)]
);

export const businessSettings = pgTable("business_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull().default("GroomBook"),
  logoBase64: text("logo_base64"),
  logoMimeType: text("logo_mime_type"),
  primaryColor: text("primary_color").notNull().default("#4f8a6f"),
  accentColor: text("accent_color").notNull().default("#8b7355"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const groomingVisitLogs = pgTable("grooming_visit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  petId: uuid("pet_id")
    .notNull()
    .references(() => pets.id, { onDelete: "cascade" }),
  appointmentId: uuid("appointment_id").references(() => appointments.id, {
    onDelete: "set null",
  }),
  staffId: uuid("staff_id").references(() => staff.id, {
    onDelete: "set null",
  }),
  cutStyle: text("cut_style"),
  productsUsed: text("products_used"),
  notes: text("notes"),
  groomedAt: timestamp("groomed_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
