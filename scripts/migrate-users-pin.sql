-- Migration: add the PIN hash to users.
-- Optional per-user credential checked when switching user on the POS
-- (scrypt hash — the plain PIN is never stored or returned by the API).

-- PostgreSQL
ALTER TABLE dc_pos.users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) DEFAULT NULL;

-- MariaDB
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255) DEFAULT NULL;
