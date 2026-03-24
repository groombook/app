ALTER TABLE appointments
  ADD COLUMN confirmation_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN confirmed_at TIMESTAMPTZ,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN confirmation_token TEXT UNIQUE;

CREATE INDEX idx_appointments_confirmation_token ON appointments (confirmation_token) WHERE confirmation_token IS NOT NULL;
