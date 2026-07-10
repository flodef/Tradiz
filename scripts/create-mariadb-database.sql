
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- ============================================================
-- DC Schema - Restaurant Catalog (English table names)
-- ============================================================
CREATE DATABASE IF NOT EXISTS `DC` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC`;

-- Products (was: article)
CREATE TABLE IF NOT EXISTS `products` (
  `id` int(5) NOT NULL AUTO_INCREMENT,
  `sort_order` int(11) NOT NULL,
  `name` varchar(50) NOT NULL DEFAULT '',
  `price` decimal(8,2) NOT NULL DEFAULT 0.00,
  `photo` varchar(50) NOT NULL DEFAULT '',
  `stock` int(11) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `category` varchar(50) NOT NULL DEFAULT '',
  `description` varchar(300) DEFAULT '',
  `options` varchar(1000) DEFAULT '',
  `order_count` int(11) NOT NULL DEFAULT 0,
  `vat_rate` decimal(5,2) NOT NULL DEFAULT 20.00,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1018 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Establishment Config (was: config_etablissement)
CREATE TABLE IF NOT EXISTS `establishment_config` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `operation_mode` enum('restaurant','fastfood','tradiz') NOT NULL DEFAULT 'restaurant',
  `orange_delay_minutes` int(11) DEFAULT 5 COMMENT 'Delay in minutes before turning orange',
  `red_delay_minutes` int(11) DEFAULT 10 COMMENT 'Delay in minutes before turning red',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_order_short_number` char(3) DEFAULT '0',
  `auto_print_kitchen_ticket` tinyint(1) DEFAULT 0 COMMENT 'Enable/disable automatic kitchen ticket printing',
  `kitchen_printer_id` int(11) DEFAULT NULL COMMENT 'Kitchen ticket printer ID',
  `kitchen_view_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `grafana_access_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `note_printer_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Formula Elements (was: element_formule)
CREATE TABLE IF NOT EXISTS `formula_elements` (
  `id` varchar(50) NOT NULL DEFAULT '',
  `name` varchar(50) NOT NULL,
  `category` varchar(50) DEFAULT NULL,
  KEY `Index 1` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Formulas (was: formule)
CREATE TABLE IF NOT EXISTS `formulas` (
  `id` varchar(50) NOT NULL DEFAULT '',
  `name` varchar(50) NOT NULL,
  `price` decimal(8,2) NOT NULL DEFAULT 0.00,
  `sort_order` int(11) NOT NULL,
  `order_count` int(11) NOT NULL DEFAULT 0,
  KEY `Index 1` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Walls (was: mur)
CREATE TABLE IF NOT EXISTS `walls` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `x1` int(11) NOT NULL,
  `y1` int(11) NOT NULL,
  `x2` int(11) NOT NULL,
  `y2` int(11) NOT NULL,
  `color` varchar(50) DEFAULT '#252535',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Orders (was: panier)
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `short_order_number` char(3) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `notification_token` varchar(200) DEFAULT NULL,
  `service_type` enum('takeaway','on_site') DEFAULT 'takeaway',
  `done` int(1) NOT NULL DEFAULT 0,
  `paid` int(1) NOT NULL DEFAULT 0,
  `given_at` datetime DEFAULT NULL COMMENT 'Date and time when order was given to customer',
  `preparation_started_at` datetime DEFAULT NULL COMMENT 'Date and time when preparation started',
  KEY `KEY` (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=392 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Formula Element ↔ Product (was: rel_ef_article)
CREATE TABLE IF NOT EXISTS `rel_formula_element_product` (
  `formula_element_id` varchar(50) NOT NULL DEFAULT '',
  `product_id` int(11) NOT NULL,
  `sort_order` int(11) NOT NULL,
  KEY `Index 1` (`formula_element_id`,`product_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Formula Element ↔ Formula (was: rel_ef_formule)
CREATE TABLE IF NOT EXISTS `rel_formula_element_formula` (
  `formula_id` varchar(50) NOT NULL DEFAULT '',
  `formula_element_id` varchar(50) NOT NULL DEFAULT '',
  `sort_order` int(10) NOT NULL,
  KEY `Index 1` (`formula_id`,`formula_element_id`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Order ↔ Product (was: rel_panier_article)
CREATE TABLE IF NOT EXISTS `rel_order_product` (
  `order_id` int(11) NOT NULL DEFAULT 0,
  `product_id` varchar(16) NOT NULL DEFAULT '',
  `quantity` int(4) NOT NULL,
  `options` varchar(500) DEFAULT NULL,
  `checked` int(1) NOT NULL DEFAULT 0,
  `kitchen_view` int(1) NOT NULL DEFAULT 0,
  `category_name` varchar(100) NOT NULL,
  `item_id` varchar(32) NOT NULL,
  `paid_at` datetime DEFAULT NULL COMMENT 'Payment date of the item',
  KEY `KEY` (`order_id`,`product_id`) USING BTREE,
  KEY `idx_kitchen_view` (`kitchen_view`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Order ↔ Formula (was: rel_panier_formule)
CREATE TABLE IF NOT EXISTS `rel_order_formula` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `formula_id` varchar(16) NOT NULL,
  `quantity` int(2) NOT NULL,
  `note` varchar(400) DEFAULT '',
  `paid_at` datetime DEFAULT NULL COMMENT 'Payment date of the formula',
  KEY `Index 1` (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=353 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Order Formula ↔ Elements (was: rel_pf_ef)
CREATE TABLE IF NOT EXISTS `rel_order_formula_element` (
  `order_formula_id` varchar(16) NOT NULL,
  `formula_element_id` varchar(16) NOT NULL,
  `product_id` int(11) NOT NULL,
  `options` varchar(1000) DEFAULT NULL,
  `checked` int(1) NOT NULL DEFAULT 0,
  `kitchen_view` int(1) NOT NULL,
  `category_name` varchar(100) NOT NULL,
  `item_id` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp() COMMENT 'Creation date of the element',
  `preparation_started_at` timestamp NULL DEFAULT current_timestamp(),
  KEY `Index 1` (`order_formula_id`,`formula_element_id`),
  KEY `idx_kitchen_view` (`kitchen_view`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Relation: Table ↔ Order (was: rel_table_panier)
CREATE TABLE IF NOT EXISTS `rel_table_order` (
  `table_id` varchar(16) NOT NULL DEFAULT '',
  `order_id` int(11) NOT NULL DEFAULT 0,
  KEY `KEY` (`order_id`,`table_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tables (was: table - reserved keyword)
CREATE TABLE IF NOT EXISTS `tables` (
  `id` int(16) NOT NULL,
  `state` enum('ready','activation_request','locked','active') DEFAULT 'ready',
  `visible` int(2) NOT NULL DEFAULT 0,
  `service_request` int(2) NOT NULL DEFAULT 0,
  `new_order_notification` int(2) NOT NULL DEFAULT 0,
  `qr_data` varchar(64) NOT NULL DEFAULT '',
  `password3d` varchar(3) DEFAULT NULL,
  `x` int(11) NOT NULL DEFAULT 0,
  `y` int(11) NOT NULL DEFAULT 0,
  `flash_count` int(11) NOT NULL DEFAULT 0,
  `order_count` int(11) NOT NULL DEFAULT 0,
  `guest_count` int(2) DEFAULT NULL,
  `code_updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin Themes
CREATE TABLE IF NOT EXISTS `theme_admin` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `selected` int(1) NOT NULL DEFAULT 0,
  `name` varchar(50) NOT NULL DEFAULT 'unnamed',
  `text_light` varchar(9) NOT NULL,
  `text_dark` varchar(9) NOT NULL,
  `gradient_start_light` varchar(9) NOT NULL,
  `gradient_start_dark` varchar(9) NOT NULL,
  `gradient_end_light` varchar(9) NOT NULL,
  `gradient_end_dark` varchar(9) NOT NULL,
  `popup_light` varchar(9) NOT NULL,
  `popup_dark` varchar(9) NOT NULL,
  `activated_light` varchar(9) NOT NULL,
  `activated_dark` varchar(9) NOT NULL,
  `secondary_light` varchar(9) NOT NULL,
  `secondary_dark` varchar(9) NOT NULL,
  `secondary_activated_light` varchar(9) NOT NULL,
  `secondary_activated_dark` varchar(9) NOT NULL,
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;

-- Client Themes
CREATE TABLE IF NOT EXISTS `theme_client` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL DEFAULT 'unnamed',
  `primary_text` varchar(9) NOT NULL,
  `secondary_text` varchar(9) NOT NULL,
  `background` varchar(9) NOT NULL,
  `border` varchar(9) NOT NULL,
  `error` varchar(9) NOT NULL,
  `success` varchar(9) NOT NULL,
  `warning` varchar(9) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `theme_type` varchar(20) NOT NULL DEFAULT 'custom',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DC_POS Schema - Point of Sale (English table names)
-- ============================================================
CREATE DATABASE IF NOT EXISTS `DC_POS` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC_POS`;

-- Currencies
CREATE TABLE IF NOT EXISTS `currencies` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(50) NOT NULL,
  `symbol` varchar(5) NOT NULL,
  `max_value` decimal(10,4) DEFAULT NULL,
  `decimals` int(1) DEFAULT 2,
  `rate` DECIMAL(10,4) NULL DEFAULT '0.00000',
  `fee` DECIMAL(3,1) NULL DEFAULT '0.0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Transactions (was: facturation) - with payment_method and currency as strings + hash
CREATE TABLE IF NOT EXISTS `transactions` (
  `id` int(16) NOT NULL AUTO_INCREMENT,
  `order_id` varchar(50) NOT NULL,
  `user_name` VARCHAR(255) NOT NULL DEFAULT 'Cashier',
  `payment_method` varchar(50) NOT NULL DEFAULT '',
  `amount` float NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT '',
  `note` varchar(300) DEFAULT NULL,
  `hash` varchar(64) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `hash` (`hash`),
  KEY `payment_method` (`payment_method`),
  KEY `currency` (`currency`)
) ENGINE=InnoDB AUTO_INCREMENT=209 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Transaction Items (was: facturation_article)
CREATE TABLE IF NOT EXISTS `transaction_items` (
  `id` int(16) NOT NULL AUTO_INCREMENT,
  `transaction_id` int(11) NOT NULL,
  `product_id` int(11) DEFAULT NULL,
  `label` varchar(100) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `amount` float DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `discount_amount` float DEFAULT 0,
  `discount_unit` varchar(10) DEFAULT '',
  `total` float DEFAULT NULL,
  `vat_rate` decimal(5,2) NOT NULL DEFAULT 20.00,
  PRIMARY KEY (`id`),
  KEY `transaction_id` (`transaction_id`),
  CONSTRAINT `transaction_items_ibfk_1` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=298 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Parameters
CREATE TABLE IF NOT EXISTS `parameters` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `param_key` varchar(100) NOT NULL,
  `param_value` varchar(255) DEFAULT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `param_key` (`param_key`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Payment Methods
CREATE TABLE IF NOT EXISTS `payment_methods` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(50) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `currency` varchar(10) DEFAULT '€',
  `hidden` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `label` (`label`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Printers
CREATE TABLE IF NOT EXISTS `printers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `ip_address` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `note_enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Discounts
CREATE TABLE IF NOT EXISTS `discounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `value` decimal(10,2) NOT NULL,
  `unity` varchar(10) NOT NULL, -- '%' or 'currency'
  PRIMARY KEY (`id`),
  UNIQUE KEY `value_unity` (`value`, `unity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Users (default name is 'Comptoir' - handled in app code)
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `role` enum('Cashier','Service','Kitchen','Admin') NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_temp` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Customers
CREATE TABLE IF NOT EXISTS `customers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `reference` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `company` varchar(255) DEFAULT NULL,
  `balance` decimal(10,2) DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Balance History
CREATE TABLE IF NOT EXISTS `balance_history` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `customer_id` int(11) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `operation` varchar(10) NOT NULL, -- 'credit' or 'debit'
  `previous_balance` decimal(10,2) NOT NULL,
  `new_balance` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_balance_history_customer_id` (`customer_id`),
  KEY `idx_balance_history_created_at` (`created_at` DESC),
  CONSTRAINT `fk_balance_history_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DC_SYS Schema - System Logs (English table names)
-- ============================================================
CREATE DATABASE IF NOT EXISTS `DC_SYS` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC_SYS`;

-- Logs (was: log)
CREATE TABLE IF NOT EXISTS `logs` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `severity` int(2) NOT NULL DEFAULT 0,
  `ip` varchar(50) DEFAULT NULL,
  `source` varchar(50) NOT NULL,
  `data` text NOT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  KEY `Index 1` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19642 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- OTA Updates
CREATE TABLE IF NOT EXISTS `ota_updates` (
  `table_id` int(11) NOT NULL,
  `expiration` timestamp NOT NULL,
  `token` varchar(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Web Tokens
CREATE TABLE IF NOT EXISTS `web_tokens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(10) NOT NULL,
  `generated_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `expiration_timestamp` timestamp NULL DEFAULT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=428 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
