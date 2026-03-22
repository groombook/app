-- Add photo storage columns to pets table
-- Ref: GitHub #93

ALTER TABLE "pets" ADD COLUMN "photo_key" text;--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "photo_uploaded_at" timestamp;
