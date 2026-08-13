-- Migration: rename dc_sys.logs → dc_sys.connections, create new dc_sys.logs for app logs
-- Run this once on each POS database.

-- PostgreSQL
-- 1. Rename the old logs table to connections
ALTER TABLE IF EXISTS dc_sys.logs RENAME TO connections;

-- 2. Rename indexes
DROP INDEX IF EXISTS dc_sys.idx_logs_level;
DROP INDEX IF EXISTS dc_sys.idx_logs_created_at;
CREATE INDEX IF NOT EXISTS idx_connections_level ON dc_sys.connections(level);
CREATE INDEX IF NOT EXISTS idx_connections_created_at ON dc_sys.connections(created_at DESC);

-- 3. Create new logs table for application logs
CREATE TABLE IF NOT EXISTS dc_sys.logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    source VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logs_level ON dc_sys.logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON dc_sys.logs(created_at DESC);

-- MariaDB (run separately if using MariaDB)
-- 1. Rename the old logs table to connections
-- RENAME TABLE `logs` TO `connections`;
--
-- 2. Add new columns to match PostgreSQL structure (if migrating from old schema)
-- ALTER TABLE `connections`
--   ADD COLUMN `level` varchar(20) NOT NULL DEFAULT 'info' AFTER `id`,
--   ADD COLUMN `message` text AFTER `level`,
--   ADD COLUMN `metadata` JSON DEFAULT NULL AFTER `message`,
--   ADD COLUMN `created_at` timestamp NOT NULL DEFAULT current_timestamp() AFTER `metadata`;
--
-- 3. Migrate data from old columns
-- UPDATE `connections` SET
--   `level` = CASE WHEN `severity` > 0 THEN 'error' ELSE 'info' END,
--   `message` = `source`,
--   `metadata` = JSON_OBJECT('ip', `ip`, 'data', `data`),
--   `created_at` = `date`;
--
-- 4. Drop old columns
-- ALTER TABLE `connections`
--   DROP COLUMN `severity`,
--   DROP COLUMN `ip`,
--   DROP COLUMN `source`,
--   DROP COLUMN `data`,
--   DROP COLUMN `date`;
--
-- 5. Add indexes
-- ALTER TABLE `connections` ADD KEY `idx_connections_level` (`level`);
-- ALTER TABLE `connections` ADD KEY `idx_connections_created_at` (`created_at`);
--
-- 6. Create new logs table for application logs
-- CREATE TABLE IF NOT EXISTS `logs` (
--   `id` int(10) NOT NULL AUTO_INCREMENT,
--   `level` varchar(20) NOT NULL,
--   `message` text NOT NULL,
--   `source` varchar(100) DEFAULT NULL,
--   `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
--   PRIMARY KEY (`id`),
--   KEY `idx_logs_level` (`level`),
--   KEY `idx_logs_created_at` (`created_at`)
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
