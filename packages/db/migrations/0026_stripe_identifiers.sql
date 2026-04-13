ALTER TABLE "invoices" ADD COLUMN "stripe_payment_intent_id" text;
ALTER TABLE "invoices" ADD COLUMN "stripe_refund_id" text;
ALTER TABLE "invoices" ADD COLUMN "payment_failure_reason" text;
ALTER TABLE "invoices" ADD CONSTRAINT "idx_invoices_stripe_payment_intent_id" UNIQUE("stripe_payment_intent_id");