-- Migration: Add fidelity_points columns to customers and transactions tables
-- Run this script once before deploying the fidelity card feature.

-- PostgreSQL:
-- ALTER TABLE dc_pos.customers ADD COLUMN IF NOT EXISTS fidelity_points DECIMAL(10,2) DEFAULT 0.00;
-- ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS fidelity_points DECIMAL(10,2) DEFAULT NULL;

-- MariaDB / MySQL:
-- ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `fidelity_points` DECIMAL(10,2) DEFAULT 0.00;
-- ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `fidelity_points` DECIMAL(10,2) DEFAULT NULL;
