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

// ─── Better-Auth Tables ──────────────────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Tables ───────────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    emailOptOut: boolean("email_opt_out").notNull().default(false),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),
    smsConsentDate: timestamp("sms_consent_date"),
    smsOptOutDate: timestamp("sms_opt_out_date"),
    smsConsentText: text("sms_consent_text"),
    stripeCustomerId: text("stripe_customer_id"),
    status: clientStatusEnum("status").notNull().default("active"),
    disabledAt: timestamp("disabled_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_clients_email").on(t.email)]
);

export const pets = pgTable(
  "pets",
  {
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
    image: text("image"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_pets_client_id").on(t.clientId)]
);

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
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
  // Better-Auth user ID — links staff business record to auth identity
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  role: staffRoleEnum("role").notNull().default("groomer"),
  // Super users bypass appointment-booking restrictions and access admin panels
  isSuperUser: boolean("is_super_user").notNull().default(false),
  active: boolean("active").notNull().default(true),
  // Token for iCal calendar feed subscription (no auth required)
  icalToken: text("ical_token").unique(),
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

export const appointments = pgTable(
  "appointments",
  {
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
    // Customer-provided note visible to groomer (500 char max, editable until appointment starts)
    customerNotes: text("customer_notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_appointments_client_id").on(t.clientId),
    index("idx_appointments_staff_id").on(t.staffId),
    index("idx_appointments_start_time").on(t.startTime),
    index("idx_appointments_status").on(t.status),
  ]
);

export const invoices = pgTable(
  "invoices",
  {
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
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeRefundId: text("stripe_refund_id"),
    paymentFailureReason: text("payment_failure_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_invoices_client_id").on(t.clientId),
    index("idx_invoices_status").on(t.status),
    index("idx_invoices_created_at").on(t.createdAt),
    index("idx_invoices_stripe_payment_intent_id").on(t.stripePaymentIntentId),
  ]
);

export const invoiceLineItems = pgTable(
  "invoice_line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_invoice_line_items_invoice_id").on(t.invoiceId)]
);

// Per-staff tip allocation calculated when an invoice is paid.
// staff_name is snapshotted at calculation time so reports remain accurate if staff is deleted.
export const invoiceTipSplits = pgTable(
  "invoice_tip_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    staffName: text("staff_name").notNull(),
    sharePct: numeric("share_pct", { precision: 5, scale: 2 }).notNull(),
    shareCents: integer("share_cents").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_invoice_tip_splits_invoice_id").on(t.invoiceId)]
);

// Refund records with idempotency key support
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "restrict" }),
    stripeRefundId: text("stripe_refund_id").notNull(),
    idempotencyKey: text("idempotency_key").unique(),
    amountCents: integer("amount_cents"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_refunds_invoice_id").on(t.invoiceId),
    index("idx_refunds_idempotency_key").on(t.idempotencyKey),
  ]
);

// Tracks which reminder emails have been sent per appointment (prevents duplicates).
// reminder_type values: "confirmation", "24h", "2h"
// channel values: "email", "sms"
export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    // "confirmation" | "24h" | "2h"
    reminderType: text("reminder_type").notNull(),
    // "email" | "sms"
    channel: text("channel").notNull().default("email"),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.appointmentId, t.reminderType, t.channel)]
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

// ─── Messaging ───────────────────────────────────────────────────────────────

export const messagingChannelEnum = pgEnum("messaging_channel", ["sms", "mms"]);

export const messageDirectionEnum = pgEnum("message_direction", [
  "inbound",
  "outbound",
]);

export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sent",
  "delivered",
  "failed",
  "received",
]);

export const messageConsentKindEnum = pgEnum("message_consent_kind", [
  "opt_in",
  "opt_out",
  "help",
]);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    businessId: uuid("business_id").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    channel: messagingChannelEnum("channel").notNull(),
    externalNumber: text("external_number").notNull(),
    businessNumber: text("business_number").notNull(),
    lastMessageAt: timestamp("last_message_at"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_conversations_business_id_last_message_at").on(
      t.businessId,
      t.lastMessageAt
    ),
    unique("uq_conversations_business_client_number").on(
      t.businessId,
      t.clientId,
      t.businessNumber
    ),
  ]
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    direction: messageDirectionEnum("direction").notNull(),
    body: text("body"),
    status: messageStatusEnum("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    sentByStaffId: uuid("sent_by_staff_id").references(() => staff.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at"),
    readByClientAt: timestamp("read_by_client_at"),
  },
  (t) => [
    index("idx_messages_conversation_id_created_at").on(t.conversationId, t.createdAt),
    unique("uq_messages_provider_message_id").on(t.providerMessageId),
  ]
);

export const messageAttachments = pgTable(
  "message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    url: text("url").notNull(),
    size: integer("size").notNull(),
    providerMediaId: text("provider_media_id"),
  },
  (t) => [index("idx_message_attachments_message_id").on(t.messageId)]
);

export const messageConsentEvents = pgTable(
  "message_consent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    kind: messageConsentKindEnum("kind").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_message_consent_events_client_id").on(t.clientId)]
);

export const businessSettings = pgTable("business_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  businessName: text("business_name").notNull().default("GroomBook"),
  logoBase64: text("logo_base64"),
  logoMimeType: text("logo_mime_type"),
  logoKey: text("logo_key"),
  primaryColor: text("primary_color").notNull().default("#4f8a6f"),
  accentColor: text("accent_color").notNull().default("#8b7355"),
  messagingPhoneNumber: text("messaging_phone_number"),
  telnyxMessagingProfileId: text("telnyx_messaging_profile_id"),
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

export const waitlistStatusEnum = pgEnum("waitlist_status", [
  "active",
  "notified",
  "expired",
  "cancelled",
]);

export const waitlistEntries = pgTable(
  "waitlist_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    petId: uuid("pet_id")
      .notNull()
      .references(() => pets.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    preferredDate: text("preferred_date").notNull(),
    preferredTime: text("preferred_time").notNull(),
    status: waitlistStatusEnum("status").notNull().default("active"),
    notifiedAt: timestamp("notified_at"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_waitlist_client_id").on(t.clientId),
    index("idx_waitlist_preferred_date").on(t.preferredDate),
    index("idx_waitlist_status").on(t.status),
  ]
);

// ─── Auth Provider Config ──────────────────────────────────────────────────

export const authProviderConfig = pgTable("auth_provider_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerId: text("provider_id").notNull().unique(), // e.g. "authentik", "okta", "entra-id"
  displayName: text("display_name").notNull(), // shown on login button
  issuerUrl: text("issuer_url").notNull(), // OIDC issuer/discovery URL
  internalBaseUrl: text("internal_base_url"), // for hairpin NAT / K8s internal routing
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(), // AES-256-GCM encrypted using BETTER_AUTH_SECRET
  scopes: text("scopes").notNull().default("openid profile email"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
