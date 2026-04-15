-- SMS opt-in fields for clients
ALTER TABLE "clients" ADD COLUMN "sms_opt_in" boolean NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN "sms_consent_date" timestamp;
ALTER TABLE "clients" ADD COLUMN "sms_opt_out_date" timestamp;
ALTER TABLE "clients" ADD COLUMN "sms_consent_text" text;

-- Add channel column to reminder_logs with default 'email'
ALTER TABLE "reminder_logs" ADD COLUMN "channel" text NOT NULL DEFAULT 'email';

-- Drop the old unique constraint and recreate with channel
ALTER TABLE "reminder_logs" DROP CONSTRAINT "reminder_logs_appointment_id_reminder_type_unique";
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_appointment_id_reminder_type_channel_unique" UNIQUE ("appointment_id", "reminder_type", "channel");
