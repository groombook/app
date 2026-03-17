-- Extend pet profiles with grooming-specific attributes (closes groombook/groombook#13)
ALTER TABLE "pets"
  ADD COLUMN "cut_style" text,
  ADD COLUMN "shampoo_preference" text,
  ADD COLUMN "special_care_notes" text,
  ADD COLUMN "custom_fields" jsonb DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE TABLE "grooming_visit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pet_id" uuid NOT NULL,
  "appointment_id" uuid,
  "staff_id" uuid,
  "cut_style" text,
  "products_used" text,
  "notes" text,
  "groomed_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "grooming_visit_logs"
  ADD CONSTRAINT "grooming_visit_logs_pet_id_pets_id_fk"
    FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grooming_visit_logs"
  ADD CONSTRAINT "grooming_visit_logs_appointment_id_appointments_id_fk"
    FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "grooming_visit_logs"
  ADD CONSTRAINT "grooming_visit_logs_staff_id_staff_id_fk"
    FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
