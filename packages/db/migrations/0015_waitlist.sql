CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  pet_id UUID NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  preferred_date DATE NOT NULL,
  preferred_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  notified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waitlist_client_id ON waitlist_entries (client_id);
CREATE INDEX idx_waitlist_preferred_date ON waitlist_entries (preferred_date);
CREATE INDEX idx_waitlist_status ON waitlist_entries (status) WHERE status = 'active';
CREATE UNIQUE INDEX idx_waitlist_active_unique ON waitlist_entries (client_id, pet_id, service_id, preferred_date, preferred_time) WHERE status = 'active';
