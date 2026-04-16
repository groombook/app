-- SMS opt-in fields for clients (idempotent)
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sms_opt_in" boolean NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sms_consent_date" timestamp;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sms_opt_out_date" timestamp;
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "sms_consent_text" text;

-- Add channel column to reminder_logs with default 'email' (idempotent)
ALTER TABLE "reminder_logs" ADD COLUMN IF NOT EXISTS "channel" text NOT NULL DEFAULT 'email';

-- Drop old unique constraints if they exist (idempotent)
ALTER TABLE "reminder_logs" DROP CONSTRAINT IF EXISTS "reminder_logs_appointment_id_reminder_type_key";
ALTER TABLE "reminder_logs" DROP CONSTRAINT IF EXISTS "reminder_logs_appointment_id_reminder_type_unique";

-- Add new unique constraint with channel
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_appointment_id_reminder_type_channel_unique" UNIQUE ("appointment_id", "reminder_type", "channel");
