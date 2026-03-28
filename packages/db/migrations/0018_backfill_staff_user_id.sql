-- Backfill staff.user_id for staff records created before Better-Auth integration.
-- Staff records that predate this migration have user_id = NULL; the resolveStaffMiddleware
-- now falls back to staff.id (dev mode) and oidcSub (production) so these records still work.
-- This migration populates user_id for the known demo/dev staff seeded by seed.ts.

-- Create demo Better-Auth users for seeded staff (these match the ba-user-* IDs used in tests)
INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
VALUES ('ba-user-manager', 'Demo Manager', 'demo-manager@groombook.dev', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Link the demo manager staff record to the Better-Auth user
UPDATE staff
SET user_id = 'ba-user-manager', updated_at = NOW()
WHERE oidc_sub = 'demo-manager-001' AND user_id IS NULL;
