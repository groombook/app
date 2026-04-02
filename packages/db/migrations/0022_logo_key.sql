-- Add logo_key column to business_settings for S3-based logo storage
ALTER TABLE "business_settings" ADD COLUMN "logo_key" text;