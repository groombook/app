-- Add bather/assistant staff tracking to appointments and tip split ledger (closes groombook/groombook#12)

-- Secondary staff member (e.g., bather) who assisted the primary groomer
ALTER TABLE "appointments"
  ADD COLUMN "bather_staff_id" uuid REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint

-- Stores per-staff tip allocations calculated when an invoice is paid
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
ALTER TABLE "invoice_tip_splits"
  ADD CONSTRAINT "invoice_tip_splits_invoice_id_invoices_id_fk"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invoice_tip_splits"
  ADD CONSTRAINT "invoice_tip_splits_staff_id_staff_id_fk"
    FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;
