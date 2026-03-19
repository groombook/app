-- Add client status (soft-delete support)
CREATE TYPE "client_status" AS ENUM ('active', 'disabled');

ALTER TABLE "clients"
  ADD COLUMN "status" "client_status" NOT NULL DEFAULT 'active',
  ADD COLUMN "disabled_at" timestamp;
