ALTER TABLE "clients" ADD COLUMN "stripe_customer_id" text;
ALTER TABLE "clients" ADD CONSTRAINT "idx_clients_stripe_customer_id" UNIQUE("stripe_customer_id");
ALTER TABLE "invoices" ADD COLUMN "stripe_payment_intent_id" text;
ALTER TABLE "invoices" ADD COLUMN "stripe_refund_id" text;
ALTER TABLE "invoices" ADD COLUMN "payment_failure_reason" text;
ALTER TABLE "invoices" ADD CONSTRAINT "idx_invoices_stripe_payment_intent_id" UNIQUE("stripe_payment_intent_id");
