CREATE TABLE "refunds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "invoice_id" uuid NOT NULL REFERENCES "invoices"("id") ON DELETE RESTRICT,
  "stripe_refund_id" text NOT NULL,
  "idempotency_key" text UNIQUE,
  "amount_cents" integer,
  "created_at" timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX "idx_refunds_invoice_id" ON "refunds"("invoice_id");
CREATE INDEX "idx_refunds_idempotency_key" ON "refunds"("idempotency_key");
