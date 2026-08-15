-- Migration: add employer_share column to transactions table
-- Stores the employer's contribution (Quote part employeur) for company
-- customers whose company has a meal price > 0.

-- PostgreSQL
ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS employer_share NUMERIC(10,2) DEFAULT NULL;

-- MariaDB (run separately if using MariaDB)
-- ALTER TABLE transactions ADD COLUMN IF NOT EXISTS employer_share DECIMAL(10,2) DEFAULT NULL;
