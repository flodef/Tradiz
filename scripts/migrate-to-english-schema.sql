-- ============================================================
-- Migration Script: French Table Names to English
-- + Convert facturation to use payment_method/currency as strings
-- + Add hash column for data integrity
--
-- This script migrates data from the old French-named tables
-- to the new English-named tables with the updated structure.
--
-- Usage:
--   MariaDB: mysql -u root -p DC < migrate-to-english-schema.sql
--   PostgreSQL: psql $DATABASE_URL -f migrate-to-english-schema.sql
-- ============================================================

-- ============================================================
-- MARIADB MIGRATION
-- ============================================================

-- For MariaDB, run this section:

USE `DC`;

-- Migrate article → products (with reference column added)
INSERT INTO `products` (`id`, `sort_order`, `name`, `price`, `photo`, `available`, `stock`, `reference`, `category_id`, `description`, `options`, `order_count`, `vat_rate`)
SELECT `id`, `ordre`, `nom`, `prix`, `photo`, `disponible`, `stock`, NULL, `categorie`, `description`, `options`, `nbr_commandes`, `taux_tva` FROM `article`;

-- Migrate categorie → categories
INSERT INTO `categories` (`id`, `name`, `sort_order`, `default_vat_rate`)
SELECT `id`, `nom`, `ordre`, `taux_tva_default` FROM `categorie`;

-- Migrate config_etablissement → establishment_config
INSERT INTO `establishment_config` (`id`, `operation_mode`, `orange_delay_minutes`, `red_delay_minutes`, `updated_at`, `last_order_short_number`, `auto_print_kitchen_ticket`, `kitchen_printer_id`, `kitchen_view_enabled`, `grafana_access_enabled`, `note_printer_id`)
SELECT `id`, `mode_fonctionnement`, `delai_orange_minutes`, `delai_rouge_minutes`, `updated_at`, `last_order_short_number`, `auto_print_kitchen_ticket`, `kitchen_printer_id`, `kitchen_view_enabled`, `grafana_access_enabled`, `note_printer_id` FROM `config_etablissement`;

-- Migrate element_formule → formula_elements
INSERT INTO `formula_elements` (`id`, `name`, `category_id`)
SELECT `id`, `nom`, `id_categorie` FROM `element_formule`;

-- Migrate formule → formulas
INSERT INTO `formulas` (`id`, `name`, `price`, `sort_order`, `order_count`)
SELECT `id`, `nom`, `prix`, `ordre`, `nbr_commandes` FROM `formule`;

-- Migrate mur → walls
INSERT INTO `walls` (`id`, `x1`, `y1`, `x2`, `y2`, `color`)
SELECT `id`, `x1`, `y1`, `x2`, `y2`, `color` FROM `mur`;

-- Migrate panier → orders (with new English field names and enum values)
INSERT INTO `orders` (`id`, `short_order_number`, `created_at`, `notification_token`, `service_type`, `done`, `paid`, `given_at`, `preparation_started_at`)
SELECT `id`, `short_num_order`, `date`, `token_notif`, 
  CASE WHEN `service_type` = 'emporter' THEN 'takeaway' ELSE 'on_site' END,
  `done`, `paid`, `given_at`, `preparation_started_at` FROM `panier`;

-- Migrate rel_ef_article → rel_formula_element_product
INSERT INTO `rel_formula_element_product` (`formula_element_id`, `product_id`, `sort_order`)
SELECT `id_element_formule`, `id_article`, `ordre` FROM `rel_ef_article`;

-- Migrate rel_ef_formule → rel_formula_element_formula
INSERT INTO `rel_formula_element_formula` (`formula_id`, `formula_element_id`, `sort_order`)
SELECT `id_formule`, `id_element_formule`, `ordre` FROM `rel_ef_formule`;

-- Migrate rel_panier_article → rel_order_product
INSERT INTO `rel_order_product` (`order_id`, `product_id`, `quantity`, `options`, `checked`, `kitchen_view`, `category_name`, `item_id`, `paid_at`)
SELECT `panier_id`, `article_id`, `quantite`, `option`, `checked`, `kitchen_view`, `nom_categorie`, `id`, `paid_at` FROM `rel_panier_article`;

-- Migrate rel_panier_formule → rel_order_formula
INSERT INTO `rel_order_formula` (`id`, `order_id`, `formula_id`, `quantity`, `note`, `paid_at`)
SELECT `id`, `panier_id`, `formule_id`, `quantite`, `note`, `paid_at` FROM `rel_panier_formule`;

-- Migrate rel_pf_ef → rel_order_formula_element
INSERT INTO `rel_order_formula_element` (`order_formula_id`, `formula_element_id`, `product_id`, `options`, `checked`, `kitchen_view`, `category_name`, `item_id`, `created_at`, `preparation_started_at`)
SELECT `id_pf`, `id_ef`, `id_article`, `options`, `checked`, `kitchen_view`, `nom_categorie`, `id`, `created_at`, `preparation_started_at` FROM `rel_pf_ef`;

-- Migrate rel_table_panier → rel_table_order
INSERT INTO `rel_table_order` (`table_id`, `order_id`)
SELECT `table_id`, `panier_id` FROM `rel_table_panier`;

-- Migrate `table` → tables
INSERT INTO `tables` (`id`, `state`, `visible`, `service_request`, `new_order_notification`, `qr_data`, `password3d`, `x`, `y`, `flash_count`, `order_count`, `guest_count`, `code_updated_at`)
SELECT `id`, `state`, `visible`, `demande_serv`, `new_order_notification`, `qr_data`, `password3D`, `x`, `y`, `nbr_flash`, `nbr_commandes`, `nbr_couverts`, `code_updated_at` FROM `table`;

-- Migrate theme_admin and theme_client (same structure, just copy)
INSERT INTO `theme_admin` (`id`, `selected`, `name`, `text_light`, `text_dark`, `gradient_start_light`, `gradient_start_dark`, `gradient_end_light`, `gradient_end_dark`, `popup_light`, `popup_dark`, `activated_light`, `activated_dark`, `secondary_light`, `secondary_dark`, `secondary_activated_light`, `secondary_activated_dark`)
SELECT `id`, `selected`, `name`, `text_light`, `text_dark`, `gradient_start_light`, `gradient_start_dark`, `gradient_end_light`, `gradient_end_dark`, `popup_light`, `popup_dark`, `activated_light`, `activated_dark`, `secondary_light`, `secondary_dark`, `secondary_activated_light`, `secondary_activated_dark` FROM `theme_admin`;

INSERT INTO `theme_client` (`id`, `name`, `primary_text`, `secondary_text`, `background`, `border`, `error`, `success`, `warning`, `is_active`, `theme_type`)
SELECT `id`, `name`, `primary_text`, `secondary_text`, `background`, `border`, `error`, `success`, `warning`, `is_active`, `theme_type` FROM `theme_client`;

USE `DC_POS`;

-- Migrate currency → currencies
INSERT INTO `currencies` (`id`, `label`, `symbol`, `max_value`, `decimals`, `rate`, `fee`)
SELECT `id`, `label`, `symbol`, `max_value`, `decimals`, `rate`, `fee` FROM `currency`;

-- Migrate facturation → transactions (with payment_method and currency as strings + hash, panier_id -> order_id)
-- Join with payment_methods and users to get the string values
INSERT INTO `transactions` (`id`, `order_id`, `user_name`, `payment_method`, `amount`, `currency`, `note`, `hash`, `created_at`, `updated_at`)
SELECT 
    f.`id`,
    f.`panier_id`,
    COALESCE(u.`name`, 'Cashier'),  -- Use user name as string, default to 'Cashier'
    COALESCE(pm.`label`, ''),  -- Use payment method label as string
    f.`amount`,
    COALESCE(c.`label`, '€'),    -- Use currency label as string, default to €
    f.`note`,
    SHA2(CONCAT(f.`id`, f.`panier_id`, COALESCE(u.`name`, 'Cashier'), COALESCE(pm.`label`, ''), f.`amount`, COALESCE(c.`label`, '€'), f.`created_at`), 256), -- Generate hash
    f.`created_at`,
    f.`updated_at`
FROM `facturation` f
LEFT JOIN `payment_methods` pm ON pm.`id` = f.`payment_method_id`
LEFT JOIN `currency` c ON c.`id` = f.`currency_id`
LEFT JOIN `users` u ON u.`id` = f.`user_id`;

-- Migrate facturation_article → transaction_items (transaction_id instead of facturation_id)
INSERT INTO `transaction_items` (`id`, `transaction_id`, `product_id`, `label`, `category`, `amount`, `quantity`, `discount_amount`, `discount_unit`, `total`)
SELECT 
    fa.`id`,
    fa.`facturation_id`,  -- This becomes transaction_id
    fa.`article_id`,      -- This becomes product_id
    fa.`label`,
    fa.`category`,
    fa.`amount`,
    fa.`quantity`,
    fa.`discount_amount`,
    fa.`discount_unit`,
    fa.`total`
FROM `facturation_article` fa;

-- Migrate parameters (with reference column added)
INSERT INTO `parameters` (`id`, `param_key`, `param_value`, `reference`, `updated_at`)
SELECT `id`, `param_key`, `param_value`, NULL, `updated_at` FROM `parameters`;

-- Migrate payment_methods (same structure)
INSERT INTO `payment_methods` (`id`, `label`, `address`, `currency`, `hidden`, `created_at`)
SELECT `id`, `label`, `address`, `currency`, `hidden`, `created_at` FROM `payment_methods`;

-- Migrate printers (same structure)
INSERT INTO `printers` (`id`, `name`, `ip_address`, `created_at`, `note_enabled`)
SELECT `id`, `name`, `ip_address`, `created_at`, `note_enabled` FROM `printers`;

-- Migrate discounts (update currency_id reference to new currencies table)
INSERT INTO `discounts` (`id`, `value`, `unity_type`, `currency_id`)
SELECT `id`, `value`, `unity_type`, `currency_id` FROM `discounts`;

-- Migrate users (same structure - default 'Comptoir' handled in app)
INSERT INTO `users` (`id`, `key`, `name`, `role`, `created_at`)
SELECT `id`, `key`, `name`, `role`, `created_at` FROM `users`;

USE `DC_SYS`;

-- Migrate log → logs
INSERT INTO `logs` (`id`, `severity`, `ip`, `source`, `data`, `date`)
SELECT `id`, `severity`, `ip`, `source`, `data`, `date` FROM `log`;

-- Migrate OTA → ota_updates
INSERT INTO `ota_updates` (`table_id`, `expiration`, `token`)
SELECT `table_id`, `expiration`, `token` FROM `OTA`;

-- Migrate web_token → web_tokens
INSERT INTO `web_tokens` (`id`, `type`, `generated_timestamp`, `expiration_timestamp`, `value`)
SELECT `id`, `type`, `generated_timestamp`, `expiration_timestamp`, `value` FROM `web_token`;

-- ============================================================
-- CLEANUP (Optional - run after verifying migration)
-- ============================================================

-- After verifying the migration works, you can drop old tables:
-- USE `DC`;
-- DROP TABLE IF EXISTS `article`;
-- DROP TABLE IF EXISTS `categorie`;
-- DROP TABLE IF EXISTS `config_etablissement`;
-- DROP TABLE IF EXISTS `element_formule`;
-- DROP TABLE IF EXISTS `formule`;
-- DROP TABLE IF EXISTS `mur`;
-- DROP TABLE IF EXISTS `panier`;
-- DROP TABLE IF EXISTS `rel_ef_article`;
-- DROP TABLE IF EXISTS `rel_ef_formule`;
-- DROP TABLE IF EXISTS `rel_panier_article`;
-- DROP TABLE IF EXISTS `rel_panier_formule`;
-- DROP TABLE IF EXISTS `rel_pf_ef`;
-- DROP TABLE IF EXISTS `rel_table_panier`;
-- DROP TABLE IF EXISTS `table`;
-- DROP TABLE IF EXISTS `log`;

-- USE `DC_POS`;
-- DROP TABLE IF EXISTS `facturation`;
-- DROP TABLE IF EXISTS `facturation_article`;
-- DROP TABLE IF EXISTS `currency`;

-- USE `DC_SYS`;
-- DROP TABLE IF EXISTS `log`;
-- DROP TABLE IF EXISTS `OTA`;
-- DROP TABLE IF EXISTS `web_token`;
