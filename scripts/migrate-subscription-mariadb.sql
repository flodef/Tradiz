-- ============================================================
-- Subscription tables migration (MariaDB)
-- Adds subscription (current state) and subscription_events
-- (append-only billing log) in the DC_POS database.
-- Idempotent — safe to re-run.
-- ============================================================

USE `DC_POS`;

CREATE TABLE IF NOT EXISTS `subscription` (
  `id` int(11) NOT NULL DEFAULT 1 CHECK (`id` = 1),
  `plan` varchar(20) NOT NULL DEFAULT 'privilege',
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `billing_method` varchar(20) NOT NULL DEFAULT 'invoice',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `subscription_events` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `event_type` varchar(20) NOT NULL,
  `plan` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_subscription_events_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the singleton row for existing shops (defaults to the highest plan so
-- deployed shops keep full access) and an initial 'start' event so the billing
-- history has an anchor. Adjust the plan per shop afterwards if needed:
--   UPDATE subscription SET plan = 'pro' WHERE id = 1;
INSERT IGNORE INTO `subscription` (id, plan, status, billing_method)
VALUES (1, 'privilege', 'active', 'invoice');

INSERT INTO `subscription_events` (event_type, plan)
SELECT 'start', s.plan FROM `subscription` s
WHERE s.id = 1 AND NOT EXISTS (SELECT 1 FROM `subscription_events`);
