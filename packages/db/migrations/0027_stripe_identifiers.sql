ALTER TABLE "clients" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "idx_clients_stripe_customer_id" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_payment_intent_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "stripe_refund_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_failure_reason" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "idx_invoices_stripe_payment_intent_id" UNIQUE("stripe_payment_intent_id");