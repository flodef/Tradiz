
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
CREATE DATABASE IF NOT EXISTS `DC` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC`;

CREATE TABLE IF NOT EXISTS `article` (
  `id` int(5) NOT NULL AUTO_INCREMENT,
  `ordre` int(11) NOT NULL,
  `nom` varchar(50) NOT NULL DEFAULT '',
  `prix` decimal(8,2) NOT NULL DEFAULT 0.00,
  `photo` varchar(50) NOT NULL DEFAULT '',
  `disponible` int(2) NOT NULL,
  `categorie` varchar(50) NOT NULL DEFAULT '',
  `description` varchar(300) DEFAULT '',
  `options` varchar(1000) DEFAULT '',
  `nbr_commandes` int(11) NOT NULL DEFAULT 0,
  `taux_tva` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1018 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `categorie` (
  `id` varchar(10) NOT NULL,
  `nom` varchar(50) NOT NULL,
  `ordre` int(3) NOT NULL,
  `taux_tva_default` decimal(5,2) DEFAULT 10.00,
  KEY `Index 1` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `config_etablissement` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `mode_fonctionnement` enum('restaurant','fastfood','tradiz') NOT NULL DEFAULT 'restaurant',
  `delai_orange_minutes` int(11) DEFAULT 5 COMMENT 'Délai en minutes avant passage en orange',
  `delai_rouge_minutes` int(11) DEFAULT 10 COMMENT 'Délai en minutes avant passage en rouge',
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `last_order_short_number` char(3) DEFAULT '0',
  `auto_print_kitchen_ticket` tinyint(1) DEFAULT 0 COMMENT 'Activer/désactiver l impression automatique des tickets de commande',
  `kitchen_printer_id` int(11) DEFAULT NULL COMMENT 'ID de l imprimante pour les tickets de cuisine',
  `kitchen_view_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `grafana_access_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `note_printer_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `element_formule` (
  `id` varchar(50) NOT NULL DEFAULT '',
  `nom` varchar(50) NOT NULL,
  `id_categorie` varchar(50) DEFAULT NULL,
  KEY `Index 1` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `formule` (
  `id` varchar(50) NOT NULL DEFAULT '',
  `nom` varchar(50) NOT NULL,
  `prix` decimal(8,2) NOT NULL DEFAULT 0.00,
  `ordre` int(11) NOT NULL,
  `nbr_commandes` int(11) NOT NULL DEFAULT 0,
  KEY `Index 1` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `log` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `severity` int(2) NOT NULL DEFAULT 0,
  `ip` varchar(50) DEFAULT NULL,
  `source` varchar(50) NOT NULL,
  `data` text NOT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  KEY `Index 1` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=36892 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mur` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `x1` int(11) NOT NULL,
  `y1` int(11) NOT NULL,
  `x2` int(11) NOT NULL,
  `y2` int(11) NOT NULL,
  `color` varchar(50) DEFAULT '#252535',
  PRIMARY KEY (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=107 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `panier` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `short_num_order` char(3) NOT NULL DEFAULT '0',
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  `token_notif` varchar(200) DEFAULT NULL,
  `service_type` enum('emporter','sur_place') DEFAULT 'emporter',
  `done` int(1) NOT NULL DEFAULT 0,
  `paid` int(1) NOT NULL DEFAULT 0,
  `given_at` datetime DEFAULT NULL COMMENT 'Date et heure à laquelle la commande a été donnée au client',
  `preparation_started_at` datetime DEFAULT NULL COMMENT 'Date et heure du début de préparation de la commande',
  KEY `KEY` (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=392 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_ef_article` (
  `id_element_formule` varchar(50) NOT NULL DEFAULT '',
  `id_article` int(11) NOT NULL,
  `ordre` int(11) NOT NULL,
  KEY `Index 1` (`id_element_formule`,`id_article`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_ef_formule` (
  `id_formule` varchar(50) NOT NULL DEFAULT '',
  `id_element_formule` varchar(50) NOT NULL DEFAULT '',
  `ordre` int(10) NOT NULL,
  KEY `Index 1` (`id_formule`,`id_element_formule`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_panier_article` (
  `panier_id` int(11) NOT NULL DEFAULT 0,
  `article_id` varchar(16) NOT NULL DEFAULT '',
  `quantite` int(4) NOT NULL,
  `option` varchar(500) DEFAULT NULL,
  `checked` int(1) NOT NULL DEFAULT 0,
  `kitchen_view` int(1) NOT NULL DEFAULT 0,
  `nom_categorie` varchar(100) NOT NULL,
  `id` varchar(32) NOT NULL,
  `paid_at` datetime DEFAULT NULL COMMENT 'Date de paiement de l''article',
  KEY `KEY` (`panier_id`,`article_id`) USING BTREE,
  KEY `idx_kitchen_view` (`kitchen_view`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_panier_formule` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `panier_id` int(11) NOT NULL,
  `formule_id` varchar(16) NOT NULL,
  `quantite` int(2) NOT NULL,
  `note` varchar(400) DEFAULT '',
  `paid_at` datetime DEFAULT NULL COMMENT 'Date de paiement de la formule',
  KEY `Index 1` (`id`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=353 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_pf_ef` (
  `id_pf` varchar(16) NOT NULL,
  `id_ef` varchar(16) NOT NULL,
  `id_article` int(11) NOT NULL,
  `options` varchar(1000) DEFAULT NULL,
  `checked` int(1) NOT NULL DEFAULT 0,
  `kitchen_view` int(1) NOT NULL,
  `nom_categorie` varchar(100) NOT NULL,
  `id` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp() COMMENT 'Date de création de l''élément',
  `preparation_started_at` timestamp NULL DEFAULT current_timestamp(),
  KEY `Index 1` (`id_pf`,`id_ef`),
  KEY `idx_kitchen_view` (`kitchen_view`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rel_table_panier` (
  `table_id` varchar(16) NOT NULL DEFAULT '',
  `panier_id` int(11) NOT NULL DEFAULT 0,
  KEY `KEY` (`panier_id`,`table_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `table` (
  `id` int(16) NOT NULL,
  `state` enum('ready','activation_request','locked','active') DEFAULT 'ready',
  `visible` int(2) NOT NULL DEFAULT 0,
  `demande_serv` int(2) NOT NULL DEFAULT 0,
  `new_order_notification` int(2) NOT NULL DEFAULT 0,
  `qr_data` varchar(64) NOT NULL DEFAULT '',
  `password3D` varchar(3) DEFAULT NULL,
  `x` int(11) NOT NULL DEFAULT 0,
  `y` int(11) NOT NULL DEFAULT 0,
  `nbr_flash` int(11) NOT NULL DEFAULT 0,
  `nbr_commandes` int(11) NOT NULL DEFAULT 0,
  `nbr_couverts` int(2) DEFAULT NULL,
  `code_updated_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
CREATE DATABASE IF NOT EXISTS `DC_POS` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC_POS`;

CREATE TABLE IF NOT EXISTS `currency` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `label` varchar(50) NOT NULL,
  `symbol` varchar(5) NOT NULL,
  `max_value` decimal(10,4) DEFAULT NULL,
  `decimals` int(1) DEFAULT 2,
  `rate` DECIMAL(10,4) NULL DEFAULT '0.00000',
  `fee` DECIMAL(3,1) NULL DEFAULT '0.0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `facturation` (
  `id` int(16) NOT NULL AUTO_INCREMENT,
  `panier_id` varchar(50) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `payment_method_id` int(11) DEFAULT NULL,
  `amount` float NOT NULL,
  `currency_id` int(11) DEFAULT NULL,
  `note` varchar(300) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `payment_method_id` (`payment_method_id`),
  KEY `currency_id` (`currency_id`),
  CONSTRAINT `currency_id_ibfk_3` FOREIGN KEY (`currency_id`) REFERENCES `currency` (`id`),
  CONSTRAINT `facturation_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `facturation_ibfk_2` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=209 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `facturation_article` (
  `id` int(16) NOT NULL AUTO_INCREMENT,
  `facturation_id` int(11) NOT NULL,
  `article_id` int(11) DEFAULT NULL,
  `label` varchar(100) DEFAULT NULL,
  `category` varchar(50) DEFAULT NULL,
  `amount` float DEFAULT NULL,
  `quantity` int(11) DEFAULT NULL,
  `discount_amount` float DEFAULT 0,
  `discount_unit` varchar(10) DEFAULT '',
  `total` float DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `facturation_id` (`facturation_id`),
  CONSTRAINT `facturation_article_ibfk_1` FOREIGN KEY (`facturation_id`) REFERENCES `facturation` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=298 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parameters` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `param_key` varchar(100) NOT NULL,
  `param_value` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `param_key` (`param_key`)
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS `printers` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `ip_address` varchar(50) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `note_enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `discounts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `value` decimal(10,2) NOT NULL,
  `unity_type` varchar(10) NOT NULL, -- '%' or 'currency'
  `currency_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `currency_id` (`currency_id`),
  CONSTRAINT `discounts_ibfk_1` FOREIGN KEY (`currency_id`) REFERENCES `currency` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `key` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `role` enum('Cashier','Service','Kitchen','Admin') NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_temp` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS `DC_SYS` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */;

USE `DC_SYS`;

CREATE TABLE IF NOT EXISTS `log` (
  `id` int(10) NOT NULL AUTO_INCREMENT,
  `severity` int(2) NOT NULL DEFAULT 0,
  `ip` varchar(50) DEFAULT NULL,
  `source` varchar(50) NOT NULL,
  `data` text NOT NULL,
  `date` timestamp NOT NULL DEFAULT current_timestamp(),
  KEY `Index 1` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=19642 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `OTA` (
  `table_id` int(11) NOT NULL,
  `expiration` timestamp NOT NULL,
  `token` varchar(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `web_token` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `type` varchar(10) NOT NULL,
  `generated_timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `expiration_timestamp` timestamp NULL DEFAULT NULL,
  `value` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=428 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;