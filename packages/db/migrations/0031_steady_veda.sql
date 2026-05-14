CREATE TYPE "public"."client_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."coat_type" AS ENUM('smooth', 'double', 'curly', 'wire', 'long', 'hairless');--> statement-breakpoint
CREATE TYPE "public"."impersonation_session_status" AS ENUM('active', 'ended', 'expired');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'pending', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."message_consent_kind" AS ENUM('opt_in', 'opt_out', 'help');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'failed', 'received');--> statement-breakpoint
CREATE TYPE "public"."messaging_channel" AS ENUM('sms', 'mms');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'check', 'other');--> statement-breakpoint
CREATE TYPE "public"."pet_size_category" AS ENUM('small', 'medium', 'large', 'xlarge');--> statement-breakpoint
CREATE TYPE "public"."waitlist_status" AS ENUM('active', 'notified', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_provider_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" text NOT NULL,
	"display_name" text NOT NULL,
	"issuer_url" text NOT NULL,
	"internal_base_url" text,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_provider_config_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "buffer_time_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"size_category" "pet_size_category",
	"coat_type" "coat_type",
	"buffer_minutes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buffer_time_rules_service_id_size_category_coat_type_unique" UNIQUE("service_id","size_category","coat_type")
);
--> statement-breakpoint
CREATE TABLE "business_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_name" text DEFAULT 'GroomBook' NOT NULL,
	"logo_base64" text,
	"logo_mime_type" text,
	"logo_key" text,
	"primary_color" text DEFAULT '#4f8a6f' NOT NULL,
	"accent_color" text DEFAULT '#8b7355' NOT NULL,
	"messaging_phone_number" text,
	"telnyx_messaging_profile_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"channel" "messaging_channel" NOT NULL,
	"external_number" text NOT NULL,
	"business_number" text NOT NULL,
	"last_message_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uq_conversations_business_client_number" UNIQUE("business_id","client_id","business_number")
);
--> statement-breakpoint
CREATE TABLE "grooming_visit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pet_id" uuid NOT NULL,
	"appointment_id" uuid,
	"staff_id" uuid,
	"cut_style" text,
	"products_used" text,
	"notes" text,
	"groomed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"action" text NOT NULL,
	"page_visited" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "impersonation_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"reason" text,
	"status" "impersonation_session_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_tip_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"staff_id" uuid,
	"staff_name" text NOT NULL,
	"share_pct" numeric(5, 2) NOT NULL,
	"share_cents" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid,
	"client_id" uuid NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"tip_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"payment_method" "payment_method",
	"paid_at" timestamp,
	"stripe_payment_intent_id" text,
	"stripe_refund_id" text,
	"payment_failure_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"url" text NOT NULL,
	"size" integer NOT NULL,
	"provider_media_id" text
);
--> statement-breakpoint
CREATE TABLE "message_consent_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"kind" "message_consent_kind" NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"body" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"error_code" text,
	"error_message" text,
	"sent_by_staff_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delivered_at" timestamp,
	"read_by_client_at" timestamp,
	CONSTRAINT "uq_messages_provider_message_id" UNIQUE("provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"frequency_weeks" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"stripe_refund_id" text NOT NULL,
	"idempotency_key" text,
	"amount_cents" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_id" uuid NOT NULL,
	"reminder_type" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_logs_appointment_id_reminder_type_channel_unique" UNIQUE("appointment_id","reminder_type","channel")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"pet_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"preferred_date" text NOT NULL,
	"preferred_time" text NOT NULL,
	"status" "waitlist_status" DEFAULT 'active' NOT NULL,
	"notified_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "bather_staff_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "series_index" integer;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "confirmation_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "confirmed_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "confirmation_token" text;--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "customer_notes" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "email_opt_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_date" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_opt_out_date" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_text" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "status" "client_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "health_alerts" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "cut_style" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "shampoo_preference" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "special_care_notes" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "photo_uploaded_at" timestamp;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "size_category" "pet_size_category";--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "coat_type" "coat_type";--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "default_buffer_minutes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "is_super_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "ical_token" text;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointment_groups" ADD CONSTRAINT "appointment_groups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buffer_time_rules" ADD CONSTRAINT "buffer_time_rules_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grooming_visit_logs" ADD CONSTRAINT "grooming_visit_logs_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grooming_visit_logs" ADD CONSTRAINT "grooming_visit_logs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grooming_visit_logs" ADD CONSTRAINT "grooming_visit_logs_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_audit_logs" ADD CONSTRAINT "impersonation_audit_logs_session_id_impersonation_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."impersonation_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "impersonation_sessions" ADD CONSTRAINT "impersonation_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tip_splits" ADD CONSTRAINT "invoice_tip_splits_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_tip_splits" ADD CONSTRAINT "invoice_tip_splits_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_consent_events" ADD CONSTRAINT "message_consent_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_staff_id_staff_id_fk" FOREIGN KEY ("sent_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_buffer_rules_service_id" ON "buffer_time_rules" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_conversations_business_id_last_message_at" ON "conversations" USING btree ("business_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "impersonation_audit_logs_session_id_idx" ON "impersonation_audit_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_staff_id_status_idx" ON "impersonation_sessions" USING btree ("staff_id","status");--> statement-breakpoint
CREATE INDEX "impersonation_sessions_client_id_idx" ON "impersonation_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_line_items_invoice_id" ON "invoice_line_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_tip_splits_invoice_id" ON "invoice_tip_splits" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_client_id" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoices_created_at" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_invoices_stripe_payment_intent_id" ON "invoices" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachments_message_id" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_consent_events_client_id" ON "message_consent_events" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_messages_conversation_id_created_at" ON "messages" USING btree ("conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_refunds_invoice_id" ON "refunds" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_refunds_idempotency_key" ON "refunds" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_waitlist_client_id" ON "waitlist_entries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_waitlist_preferred_date" ON "waitlist_entries" USING btree ("preferred_date");--> statement-breakpoint
CREATE INDEX "idx_waitlist_status" ON "waitlist_entries" USING btree ("status");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_bather_staff_id_staff_id_fk" FOREIGN KEY ("bather_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_series_id_recurring_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."recurring_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_group_id_appointment_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."appointment_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_appointments_client_id" ON "appointments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_staff_id" ON "appointments" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "idx_appointments_start_time" ON "appointments" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_appointments_status" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_clients_email" ON "clients" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_pets_client_id" ON "pets" USING btree ("client_id");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_confirmation_token_unique" UNIQUE("confirmation_token");--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_ical_token_unique" UNIQUE("ical_token");