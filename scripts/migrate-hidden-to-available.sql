-- Migration: rename payment_methods.hidden → available (reversed concept)
-- hidden=true (hidden)   → available=false
-- hidden=false (visible) → available=true
-- Run this once on each POS database.

-- PostgreSQL
ALTER TABLE dc_pos.payment_methods RENAME COLUMN hidden TO available;
UPDATE dc_pos.payment_methods SET available = NOT available;
ALTER TABLE dc_pos.payment_methods ALTER COLUMN available SET DEFAULT true;

-- MariaDB (run separately if using MariaDB)
-- ALTER TABLE payment_methods CHANGE COLUMN hidden available TINYINT(1) NOT NULL DEFAULT 1;
-- UPDATE payment_methods SET available = 1 - available;
