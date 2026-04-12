ALTER TABLE "reminder_logs" DROP CONSTRAINT "reminder_logs_appointment_id_reminder_type_unique";--> statement-breakpoint
ALTER TABLE "business_settings" ADD COLUMN "logo_key" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_date" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_opt_out_date" timestamp;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "sms_consent_text" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD COLUMN "channel" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_appointment_id_reminder_type_channel_unique" UNIQUE("appointment_id","reminder_type","channel");