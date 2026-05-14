-- Add staffReadAt column to conversations for unread tracking
ALTER TABLE "conversations" ADD COLUMN "staff_read_at" timestamp;

CREATE INDEX "idx_conversations_business_id_staff_read_at" ON "conversations"("business_id", "staff_read_at" DESC);
