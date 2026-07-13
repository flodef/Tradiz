-- ============================================================
-- Migration: split existing users into users + devices
--
-- This script creates the devices table and moves the public key
-- from the users table into devices. The existing user name is
-- used as the device label.
--
-- Run against the POS database (dc_pos for PostgreSQL, DC_POS for MariaDB).
-- ============================================================

-- ============================================================
-- PostgreSQL
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_pos.devices (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    public_key VARCHAR(255) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES dc_pos.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Move existing keys into devices
INSERT INTO dc_pos.devices (label, public_key, user_id)
SELECT name, key, id
FROM dc_pos.users
WHERE key IS NOT NULL AND key <> '';

-- Remove the key column from users
ALTER TABLE dc_pos.users DROP COLUMN IF EXISTS key;

-- ============================================================
-- MariaDB
-- ============================================================

CREATE TABLE IF NOT EXISTS `devices` (
    `id` int(11) NOT NULL AUTO_INCREMENT,
    `label` varchar(255) NOT NULL,
    `public_key` varchar(255) NOT NULL,
    `user_id` int(11) DEFAULT NULL,
    `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (`id`),
    UNIQUE KEY `public_key` (`public_key`),
    KEY `user_id` (`user_id`),
    CONSTRAINT `fk_devices_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Move existing keys into devices
INSERT INTO `devices` (label, public_key, user_id)
SELECT name, `key`, id
FROM `users`
WHERE `key` IS NOT NULL AND `key` <> '';

-- Remove the key column from users
ALTER TABLE `users` DROP COLUMN `key`;
