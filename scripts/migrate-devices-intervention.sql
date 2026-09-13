-- Migration: add the intervention flag to devices.
-- Service/admin devices (e.g. intervention laptops used to connect as admin)
-- don't count toward the subscription device quota.

-- PostgreSQL
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS intervention BOOLEAN NOT NULL DEFAULT false;

-- MariaDB
ALTER TABLE devices ADD COLUMN IF NOT EXISTS intervention TINYINT(1) NOT NULL DEFAULT 0;
