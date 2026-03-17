-- Appointment groups: link multiple appointments from the same client visit.
-- Each appointment in a group is for a different pet and may have a different groomer.
CREATE TABLE appointment_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Link appointments to a group (nullable — non-grouped appointments are unaffected)
ALTER TABLE appointments ADD COLUMN group_id UUID REFERENCES appointment_groups(id) ON DELETE SET NULL;
