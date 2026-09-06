-- Multi-Payment Migration
-- Adds a `payments` TEXT column to the transactions table for storing JSON-encoded
-- payment legs (method + amount pairs). NULL means single-payment (legacy).
-- Idempotent: safe to run multiple times.

-- === PostgreSQL ===
ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS payments TEXT DEFAULT NULL;

-- === MariaDB ===
-- MariaDB doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN before 10.5.
-- Use a prepared statement to check first:
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'payments');
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `transactions` ADD COLUMN `payments` text DEFAULT NULL',
    'SELECT "payments column already exists" AS info');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
