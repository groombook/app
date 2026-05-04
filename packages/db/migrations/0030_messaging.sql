-- Migration: 0030_messaging.sql
-- Messaging schema: conversations, messages, attachments, consent events + business messaging settings

-- ─── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE "messaging_channel" AS ENUM ('sms', 'mms');
CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');
CREATE TYPE "message_status" AS ENUM ('queued', 'sent', 'delivered', 'failed', 'received');
CREATE TYPE "message_consent_kind" AS ENUM ('opt_in', 'opt_out', 'help');

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" uuid NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "channel" "messaging_channel" NOT NULL,
  "external_number" text NOT NULL,
  "business_number" text NOT NULL,
  "last_message_at" timestamp,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "idx_conversations_business_id_last_message_at" ON "conversations"("business_id", "last_message_at" DESC);
CREATE UNIQUE INDEX "uq_conversations_business_client_number" ON "conversations"("business_id", "client_id", "business_number");

CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "conversations"("id") ON DELETE CASCADE,
  "direction" "message_direction" NOT NULL,
  "body" text,
  "status" "message_status" NOT NULL DEFAULT 'queued',
  "provider_message_id" text,
  "error_code" text,
  "error_message" text,
  "sent_by_staff_id" uuid REFERENCES "staff"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "delivered_at" timestamp,
  "read_by_client_at" timestamp
);

CREATE INDEX "idx_messages_conversation_id_created_at" ON "messages"("conversation_id", "created_at" DESC);
CREATE UNIQUE INDEX "uq_messages_provider_message_id" ON "messages"("provider_message_id");

CREATE TABLE "message_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "content_type" text NOT NULL,
  "url" text NOT NULL,
  "size" integer NOT NULL,
  "provider_media_id" text
);

CREATE INDEX "idx_message_attachments_message_id" ON "message_attachments"("message_id");

CREATE TABLE "message_consent_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "business_id" uuid NOT NULL,
  "kind" "message_consent_kind" NOT NULL,
  "source" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "idx_message_consent_events_client_id" ON "message_consent_events"("client_id");

-- ─── Business Settings extensions ────────────────────────────────────────────

ALTER TABLE "business_settings" ADD COLUMN "messaging_phone_number" text;
ALTER TABLE "business_settings" ADD COLUMN "telnyx_messaging_profile_id" text;
