-- Migration: 0029_db_indexes_constraints.sql
-- Add missing indexes on appointments, pets, clients tables and NOT NULL constraint on clients.email

-- Backfill NULL emails before setting NOT NULL
UPDATE clients SET email = concat('unknown-', id::text, '@placeholder.local') WHERE email IS NULL;

-- Add indexes on appointments table
CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_staff_id ON appointments(staff_id);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Add index on pets table
CREATE INDEX idx_pets_client_id ON pets(client_id);

-- Add index on clients table
CREATE INDEX idx_clients_email ON clients(email);

-- Set NOT NULL on clients.email (after backfill)
ALTER TABLE clients ALTER COLUMN email SET NOT NULL;
