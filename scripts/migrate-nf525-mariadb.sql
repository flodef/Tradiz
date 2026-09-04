-- NF525 Compliance Migration Script for MariaDB
-- Run this script on existing databases to add NF525 compliance tables
-- and the previous_hash column to the transactions table.

USE `DC_POS`;

-- 1. Add previous_hash column to transactions table
ALTER TABLE `transactions` ADD COLUMN IF NOT EXISTS `previous_hash` varchar(64) DEFAULT NULL;

-- 2. Create NF525 compliance tables

-- Audit Events
CREATE TABLE IF NOT EXISTS `audit_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_type` varchar(50) NOT NULL,
  `entity_type` varchar(50) NOT NULL DEFAULT 'transaction',
  `entity_id` varchar(255) DEFAULT NULL,
  `user_name` varchar(255) NOT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `detail` text,
  `event_hash` varchar(64) DEFAULT NULL,
  `previous_event_hash` varchar(64) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_audit_events_type` (`event_type`),
  KEY `idx_audit_events_entity` (`entity_id`),
  KEY `idx_audit_events_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily Closures
CREATE TABLE IF NOT EXISTS `daily_closures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `closure_date` date NOT NULL,
  `ticket_count` int(11) NOT NULL DEFAULT 0,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_ht` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_tva` decimal(12,2) NOT NULL DEFAULT 0.00,
  `cancellation_count` int(11) NOT NULL DEFAULT 0,
  `cancellation_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refund_count` int(11) NOT NULL DEFAULT 0,
  `refund_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `closure_hash` varchar(64) DEFAULT NULL,
  `previous_closure_hash` varchar(64) DEFAULT NULL,
  `closed_by` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `closure_date` (`closure_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Monthly Closures
CREATE TABLE IF NOT EXISTS `monthly_closures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `closure_month` date NOT NULL,
  `daily_closure_count` int(11) NOT NULL DEFAULT 0,
  `ticket_count` int(11) NOT NULL DEFAULT 0,
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_ht` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_tva` decimal(12,2) NOT NULL DEFAULT 0.00,
  `closure_hash` varchar(64) DEFAULT NULL,
  `previous_closure_hash` varchar(64) DEFAULT NULL,
  `closed_by` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `closure_month` (`closure_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Annual Closures
CREATE TABLE IF NOT EXISTS `annual_closures` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `closure_year` int(11) NOT NULL,
  `monthly_closure_count` int(11) NOT NULL DEFAULT 0,
  `ticket_count` int(11) NOT NULL DEFAULT 0,
  `total_amount` decimal(14,2) NOT NULL DEFAULT 0.00,
  `total_ht` decimal(14,2) NOT NULL DEFAULT 0.00,
  `total_tva` decimal(14,2) NOT NULL DEFAULT 0.00,
  `closure_hash` varchar(64) DEFAULT NULL,
  `previous_closure_hash` varchar(64) DEFAULT NULL,
  `closed_by` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `closure_year` (`closure_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Perpetual Totals
CREATE TABLE IF NOT EXISTS `perpetual_totals` (
  `id` int(1) NOT NULL DEFAULT 1,
  `total_ticket_count` bigint(20) NOT NULL DEFAULT 0,
  `total_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `total_ht` decimal(16,2) NOT NULL DEFAULT 0.00,
  `total_tva` decimal(16,2) NOT NULL DEFAULT 0.00,
  `total_cancellation_count` bigint(20) NOT NULL DEFAULT 0,
  `total_refund_count` bigint(20) NOT NULL DEFAULT 0,
  `last_closure_hash` varchar(64) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
