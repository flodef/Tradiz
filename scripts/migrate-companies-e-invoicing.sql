-- Migration: Add company fields for French e-invoicing compliance
-- and normalize 'Espèce' → 'Espèces' in payment_methods and transactions.
--
-- This file contains sections for BOTH MariaDB/MySQL and PostgreSQL.
-- Run only the section that matches your database engine.
-- All ALTER TABLE statements use IF NOT EXISTS so the script is safe to re-run.

-- ========================================================================
-- MariaDB / MySQL  —  run only this section if you use MariaDB/MySQL
-- ========================================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS siret VARCHAR(14) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL;

UPDATE payment_methods SET label = 'Espèces' WHERE label = 'Espèce';
UPDATE transactions SET payment_method = 'Espèces' WHERE payment_method = 'Espèce';

-- ========================================================================
-- PostgreSQL  —  run only this section if you use PostgreSQL
-- ========================================================================
ALTER TABLE dc_pos.companies ADD COLUMN IF NOT EXISTS siret VARCHAR(14) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN IF NOT EXISTS vat_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN IF NOT EXISTS address VARCHAR(255) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN IF NOT EXISTS zip_code VARCHAR(10) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN IF NOT EXISTS city VARCHAR(100) DEFAULT NULL;

UPDATE dc_pos.payment_methods SET label = 'Espèces' WHERE label = 'Espèce';
UPDATE dc_pos.transactions SET payment_method = 'Espèces' WHERE payment_method = 'Espèce';
