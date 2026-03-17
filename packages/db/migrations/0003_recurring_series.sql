-- Add recurring_series table to store recurrence patterns
CREATE TABLE "recurring_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"frequency_weeks" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Extend appointments with series tracking
ALTER TABLE "appointments" ADD COLUMN "series_id" uuid REFERENCES "recurring_series"("id") ON DELETE SET NULL;
ALTER TABLE "appointments" ADD COLUMN "series_index" integer;
