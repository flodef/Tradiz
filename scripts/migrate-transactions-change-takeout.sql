-- ============================================================
-- Migration: Rename note→change, add take_out, drop note
--
-- This script:
--   1. Renames the existing "note" column to "change" (preserves data)
--   2. Adds a "take_out" boolean column (default true)
--   3. Drops the "note" column (no longer used)
--
-- Usage (PostgreSQL):
--   psql "$CONN_STR" -f scripts/migrate-transactions-change-takeout.sql
-- ============================================================

-- Step 1: Rename note → change (preserves existing data)
ALTER TABLE dc_pos.transactions RENAME COLUMN note TO "change";

-- Step 2: Add take_out boolean column
ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS take_out BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- MariaDB equivalent (run manually if using MariaDB):
--
-- ALTER TABLE `transactions` CHANGE COLUMN `note` `change` varchar(300) DEFAULT NULL;
-- ALTER TABLE `transactions` ADD COLUMN `take_out` tinyint(1) NOT NULL DEFAULT 1;
-- ============================================================
