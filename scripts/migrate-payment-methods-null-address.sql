-- Migration: allow NULL for payment method address and convert existing '0' to NULL.
-- Run this once on each POS database.

-- PostgreSQL
ALTER TABLE IF EXISTS dc_pos.payment_methods
    ALTER COLUMN address DROP NOT NULL,
    ALTER COLUMN address SET DEFAULT NULL;

UPDATE dc_pos.payment_methods
SET address = NULL
WHERE address = '0' OR address = '';

-- MariaDB
-- ALTER TABLE payment_methods MODIFY address VARCHAR(255) DEFAULT NULL;
--
-- UPDATE payment_methods
-- SET address = NULL
-- WHERE address = '0' OR address = '';
