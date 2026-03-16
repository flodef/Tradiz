-- ============================================================
-- Tradiz Database Initialization Script
-- Creates both databases (main + POS) with all required tables
-- ============================================================

-- Replace 'DC' with your desired DB_NAME if different
-- The POS database will be named DB_NAME + '_POS'

-- ── 1. Create databases ─────────────────────────────────────
CREATE DATABASE IF NOT EXISTS DC CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS DC_POS CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ── 2. Create application user ──────────────────────────────
CREATE USER IF NOT EXISTS 'tradiz'@'localhost' IDENTIFIED BY 'tradiz_dev';
GRANT ALL PRIVILEGES ON DC.* TO 'tradiz'@'localhost';
GRANT ALL PRIVILEGES ON DC_POS.* TO 'tradiz'@'localhost';
FLUSH PRIVILEGES;

-- ══════════════════════════════════════════════════════════════
-- MAIN DATABASE (DC) — restaurant catalog, orders, config
-- ══════════════════════════════════════════════════════════════
USE DC;

-- Config établissement
CREATE TABLE IF NOT EXISTS config_etablissement (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mode_fonctionnement VARCHAR(50) NOT NULL DEFAULT 'restaurant'
) ENGINE=InnoDB;

-- Catégories d'articles
CREATE TABLE IF NOT EXISTS categorie (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- Articles
CREATE TABLE IF NOT EXISTS article (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prix DECIMAL(10,2) NOT NULL DEFAULT 0,
    taux_tva DECIMAL(5,4) NOT NULL DEFAULT 0.1000,
    categorie INT,
    options TEXT,
    FOREIGN KEY (categorie) REFERENCES categorie(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Formules
CREATE TABLE IF NOT EXISTS formule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prix DECIMAL(10,2) NOT NULL DEFAULT 0,
    ordre INT NOT NULL DEFAULT 0
) ENGINE=InnoDB;

-- Éléments de formule
CREATE TABLE IF NOT EXISTS element_formule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- Relation: élément_formule ↔ formule
CREATE TABLE IF NOT EXISTS rel_ef_formule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_formule INT NOT NULL,
    id_element_formule INT NOT NULL,
    ordre INT NOT NULL DEFAULT 0,
    FOREIGN KEY (id_formule) REFERENCES formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_element_formule) REFERENCES element_formule(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Relation: élément_formule ↔ article
CREATE TABLE IF NOT EXISTS rel_ef_article (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_element_formule INT NOT NULL,
    id_article INT NOT NULL,
    ordre INT NOT NULL DEFAULT 0,
    FOREIGN KEY (id_element_formule) REFERENCES element_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_article) REFERENCES article(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Panier (orders)
CREATE TABLE IF NOT EXISTS panier (
    id INT AUTO_INCREMENT PRIMARY KEY,
    short_num_order VARCHAR(50),
    service_type ENUM('sur_place','emporter') DEFAULT 'sur_place',
    paid TINYINT NOT NULL DEFAULT 0,
    preparation_started_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Relation: panier ↔ article
CREATE TABLE IF NOT EXISTS rel_panier_article (
    id INT AUTO_INCREMENT PRIMARY KEY,
    panier_id INT NOT NULL,
    article_id INT NOT NULL,
    quantite INT NOT NULL DEFAULT 1,
    nom_categorie VARCHAR(255),
    `option` TEXT,
    paid_at DATETIME,
    kitchen_view TINYINT NOT NULL DEFAULT 0,
    FOREIGN KEY (panier_id) REFERENCES panier(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES article(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Relation: panier ↔ formule
CREATE TABLE IF NOT EXISTS rel_panier_formule (
    id INT AUTO_INCREMENT PRIMARY KEY,
    panier_id INT NOT NULL,
    formule_id INT NOT NULL,
    quantite INT NOT NULL DEFAULT 1,
    note TEXT,
    paid_at DATETIME,
    FOREIGN KEY (panier_id) REFERENCES panier(id) ON DELETE CASCADE,
    FOREIGN KEY (formule_id) REFERENCES formule(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Relation: panier_formule ↔ éléments (chosen articles per formula element)
CREATE TABLE IF NOT EXISTS rel_pf_ef (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_pf INT NOT NULL,
    id_ef INT NOT NULL,
    id_article INT NOT NULL,
    nom_categorie VARCHAR(255),
    options TEXT,
    kitchen_view TINYINT NOT NULL DEFAULT 0,
    FOREIGN KEY (id_pf) REFERENCES rel_panier_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_ef) REFERENCES element_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_article) REFERENCES article(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Thème admin (couleurs UI)
CREATE TABLE IF NOT EXISTS theme_admin (
    id INT AUTO_INCREMENT PRIMARY KEY,
    selected TINYINT NOT NULL DEFAULT 0,
    text_light VARCHAR(9) DEFAULT '#000000',
    text_dark VARCHAR(9) DEFAULT '#FFFFFF',
    gradient_start_light VARCHAR(9) DEFAULT '#FFFFFF',
    gradient_start_dark VARCHAR(9) DEFAULT '#1A1A2E',
    gradient_end_light VARCHAR(9) DEFAULT '#F0F0F0',
    gradient_end_dark VARCHAR(9) DEFAULT '#16213E',
    popup_light VARCHAR(9) DEFAULT '#FFFFFF',
    popup_dark VARCHAR(9) DEFAULT '#1A1A2E',
    activated_light VARCHAR(9) DEFAULT '#E0E0E0',
    activated_dark VARCHAR(9) DEFAULT '#2A2A4A',
    secondary_light VARCHAR(9) DEFAULT '#4A90D9',
    secondary_dark VARCHAR(9) DEFAULT '#6AB0FF',
    secondary_activated_light VARCHAR(9) DEFAULT '#357ABD',
    secondary_activated_dark VARCHAR(9) DEFAULT '#4A90D9'
) ENGINE=InnoDB;

-- ══════════════════════════════════════════════════════════════
-- POS DATABASE (DC_POS) — transactions, users, payment methods
-- ══════════════════════════════════════════════════════════════
USE DC_POS;

-- Utilisateurs (caissiers)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    `key` VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Paramètres
CREATE TABLE IF NOT EXISTS parameters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    param_key VARCHAR(255) NOT NULL,
    param_value TEXT
) ENGINE=InnoDB;

-- Moyens de paiement
CREATE TABLE IF NOT EXISTS payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    address VARCHAR(255) DEFAULT '0',
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    hidden TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Facturation (transactions)
CREATE TABLE IF NOT EXISTS facturation (
    id INT AUTO_INCREMENT PRIMARY KEY,
    panier_id VARCHAR(255),
    user_id VARCHAR(255),
    payment_method_id INT,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    note TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Articles de facturation (produits dans une transaction)
CREATE TABLE IF NOT EXISTS facturation_article (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facturation_id INT NOT NULL,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    quantity INT NOT NULL DEFAULT 1,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    discount_unit VARCHAR(10) DEFAULT '%',
    total DECIMAL(10,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (facturation_id) REFERENCES facturation(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Imprimantes
CREATE TABLE IF NOT EXISTS printers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45)
) ENGINE=InnoDB;

-- ══════════════════════════════════════════════════════════════
-- SEED DATA (minimal defaults to get the app running)
-- ══════════════════════════════════════════════════════════════
USE DC;

-- Default config
INSERT INTO config_etablissement (mode_fonctionnement) VALUES ('restaurant');

-- Default theme with colors from colors.json
INSERT INTO theme_admin (
    selected,
    text_light,
    text_dark,
    gradient_start_light,
    gradient_start_dark,
    gradient_end_light,
    gradient_end_dark,
    popup_light,
    popup_dark,
    activated_light,
    activated_dark,
    secondary_light,
    secondary_dark,
    secondary_activated_light,
    secondary_activated_dark
) VALUES (
    1,
    '#d97706',  -- Texte clair
    '#facc15',  -- Texte sombre
    '#fff7ed',  -- Fond début dégradé clair
    '#65a30d',  -- Fond début dégradé sombre
    '#fed7aa',  -- Fond fin dégradé clair
    '#14532d',  -- Fond fin dégradé sombre
    '#f1f5f9',  -- Popup clair
    '#713f12',  -- Popup sombre
    '#fdba74',  -- Activé clair
    '#84cc16',  -- Activé sombre
    '#84cc16',  -- Secondaire clair
    '#fdba74',  -- Secondaire sombre
    '#a3e635',  -- Secondaire activé clair
    '#f97316'   -- Secondaire activé sombre
);

-- Sample categories
INSERT INTO categorie (nom) VALUES ('Boissons'), ('Entrées'), ('Plats'), ('Desserts');

-- Sample articles
INSERT INTO article (nom, prix, categorie) VALUES
    ('Coca-Cola', 3.00, 1),
    ('Eau', 1.50, 1),
    ('Salade César', 8.50, 2),
    ('Steak Frites', 14.00, 3),
    ('Crème Brûlée', 7.00, 4);

USE DC_POS;

-- Default payment methods
INSERT INTO payment_methods (label, currency) VALUES
    ('Carte Bancaire', '€'),
    ('Espèce', '€'),
    ('Chèque', '€');

-- Default user
INSERT INTO users (id, name, role) VALUES ('comptoir', 'Comptoir', 'Cashier');

-- Default parameters (shop name)
INSERT INTO parameters (param_key, param_value) VALUES
    ('name', 'Mon Restaurant'),
    ('address', '1 rue de la Paix'),
    ('zipCode', '75000'),
    ('city', 'Paris'),
    ('id', '123456789'),
    ('email', 'contact@monrestaurant.com');

SELECT '✅ Databases DC and DC_POS created successfully!' AS result;
