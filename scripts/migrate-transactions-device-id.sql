-- Migration: add device_id column to transactions table
-- Stores the public key / device identifier for PROCESSING transactions
-- so only the POS that created the transaction can edit it.

-- PostgreSQL
ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS device_id VARCHAR(255) DEFAULT NULL;

-- MariaDB
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS device_id VARCHAR(255) DEFAULT NULL;
