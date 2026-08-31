-- Migration: Add company fields for French e-invoicing compliance
-- Run this script on existing databases to add the new columns to the companies table.

-- ===== MariaDB / MySQL =====
ALTER TABLE companies ADD COLUMN siret VARCHAR(14) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN vat_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN address VARCHAR(255) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN zip_code VARCHAR(10) DEFAULT NULL;
ALTER TABLE companies ADD COLUMN city VARCHAR(100) DEFAULT NULL;

-- ===== Normalize 'Espèce' to 'Espèces' in payment_methods =====
-- MariaDB / MySQL:
UPDATE payment_methods SET label = 'Espèces' WHERE label = 'Espèce';

-- ===== Normalize 'Espèce' to 'Espèces' in transactions =====
-- MariaDB / MySQL:
UPDATE transactions SET payment_method = 'Espèces' WHERE payment_method = 'Espèce';

-- ===== PostgreSQL =====
ALTER TABLE dc_pos.companies ADD COLUMN siret VARCHAR(14) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN vat_number VARCHAR(50) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN address VARCHAR(255) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN zip_code VARCHAR(10) DEFAULT NULL;
ALTER TABLE dc_pos.companies ADD COLUMN city VARCHAR(100) DEFAULT NULL;

-- PostgreSQL:
UPDATE dc_pos.payment_methods SET label = 'Espèces' WHERE label = 'Espèce';

-- PostgreSQL:
UPDATE dc_pos.transactions SET payment_method = 'Espèces' WHERE payment_method = 'Espèce';
