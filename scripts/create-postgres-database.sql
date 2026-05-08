-- ============================================================
-- Create Shop Database with Schema Structure
-- 
-- This script creates a new shop database with the proper schema structure.
-- It does NOT migrate data - use migrate-to-shop-structure.sh for that.
--
-- Usage:
--   1. Replace 'annette' with your shop name throughout this file
--   2. Run: psql $DATABASE_URL -f scripts/create-shop-database.sql
-- ============================================================

-- ============================================================
-- STEP 1: Create database for shop
-- ============================================================
-- IMPORTANT: Replace 'annette' with your actual shop name
CREATE DATABASE annette;

-- Connect to the new database
\c annette

-- ============================================================
-- STEP 2: Create schemas
-- ============================================================
CREATE SCHEMA IF NOT EXISTS dc;
CREATE SCHEMA IF NOT EXISTS dc_pos;
CREATE SCHEMA IF NOT EXISTS dc_sys;

-- ============================================================
-- STEP 3: Create tables in dc schema (Restaurant Catalog)
-- ============================================================

-- Config établissement
CREATE TABLE dc.config_etablissement (
    id SERIAL PRIMARY KEY,
    mode_fonctionnement VARCHAR(50) NOT NULL DEFAULT 'restaurant',
    kitchen_view_enabled BOOLEAN NOT NULL DEFAULT true,
    grafana_access_enabled BOOLEAN NOT NULL DEFAULT true
);

-- Catégories d'articles
CREATE TABLE dc.categorie (
    id VARCHAR(10) NOT NULL,
    nom VARCHAR(50) NOT NULL,
    ordre INTEGER NOT NULL,
    taux_tva_default DECIMAL(5,2) DEFAULT 10.00
);
CREATE INDEX idx_categorie_id ON dc.categorie(id);

-- Articles
CREATE TABLE dc.article (
    id SERIAL PRIMARY KEY,
    ordre INTEGER NOT NULL,
    nom VARCHAR(50) NOT NULL DEFAULT '',
    prix NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    photo VARCHAR(50) NOT NULL DEFAULT '',
    disponible INTEGER NOT NULL,
    categorie VARCHAR(50) NOT NULL DEFAULT '',
    description VARCHAR(300) DEFAULT '',
    options VARCHAR(1000) DEFAULT '',
    nbr_commandes INTEGER NOT NULL DEFAULT 0,
    taux_tva NUMERIC(5,2) DEFAULT NULL
);

-- Formules
CREATE TABLE dc.formule (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    prix NUMERIC(10,2) NOT NULL DEFAULT 0,
    ordre INTEGER NOT NULL DEFAULT 0
);

-- Éléments de formule
CREATE TABLE dc.element_formule (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL
);

-- Relation: élément_formule ↔ formule
CREATE TABLE dc.rel_ef_formule (
    id SERIAL PRIMARY KEY,
    id_formule INTEGER NOT NULL,
    id_element_formule INTEGER NOT NULL,
    ordre INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (id_formule) REFERENCES dc.formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_element_formule) REFERENCES dc.element_formule(id) ON DELETE CASCADE
);

-- Relation: élément_formule ↔ article
CREATE TABLE dc.rel_ef_article (
    id SERIAL PRIMARY KEY,
    id_element_formule INTEGER NOT NULL,
    id_article INTEGER NOT NULL,
    ordre INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (id_element_formule) REFERENCES dc.element_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_article) REFERENCES dc.article(id) ON DELETE CASCADE
);

-- Panier (orders)
CREATE TABLE dc.panier (
    id SERIAL PRIMARY KEY,
    short_num_order VARCHAR(50),
    service_type VARCHAR(20) DEFAULT 'sur_place',
    paid BOOLEAN NOT NULL DEFAULT false,
    preparation_started_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Relation: panier ↔ article
CREATE TABLE dc.rel_panier_article (
    id SERIAL PRIMARY KEY,
    panier_id INTEGER NOT NULL,
    article_id INTEGER NOT NULL,
    quantite INTEGER NOT NULL DEFAULT 1,
    nom_categorie VARCHAR(255),
    option TEXT,
    paid_at TIMESTAMP,
    kitchen_view BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (panier_id) REFERENCES dc.panier(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES dc.article(id) ON DELETE CASCADE
);

-- Relation: panier ↔ formule
CREATE TABLE dc.rel_panier_formule (
    id SERIAL PRIMARY KEY,
    panier_id INTEGER NOT NULL,
    formule_id INTEGER NOT NULL,
    quantite INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    paid_at TIMESTAMP,
    FOREIGN KEY (panier_id) REFERENCES dc.panier(id) ON DELETE CASCADE,
    FOREIGN KEY (formule_id) REFERENCES dc.formule(id) ON DELETE CASCADE
);

-- Relation: panier_formule ↔ éléments
CREATE TABLE dc.rel_pf_ef (
    id SERIAL PRIMARY KEY,
    id_pf INTEGER NOT NULL,
    id_ef INTEGER NOT NULL,
    id_article INTEGER NOT NULL,
    nom_categorie VARCHAR(255),
    options TEXT,
    kitchen_view BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (id_pf) REFERENCES dc.rel_panier_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_ef) REFERENCES dc.element_formule(id) ON DELETE CASCADE,
    FOREIGN KEY (id_article) REFERENCES dc.article(id) ON DELETE CASCADE
);

-- Thème admin
CREATE TABLE dc.theme_admin (
    id SERIAL PRIMARY KEY,
    selected BOOLEAN NOT NULL DEFAULT false,
    name VARCHAR(50) NOT NULL DEFAULT 'unnamed',
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
);

-- Thème client
CREATE TABLE dc.theme_client (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL DEFAULT 'unnamed',
    primary_text VARCHAR(9) NOT NULL,
    secondary_text VARCHAR(9) NOT NULL,
    background VARCHAR(9) NOT NULL,
    border VARCHAR(9) NOT NULL,
    error VARCHAR(9) NOT NULL,
    success VARCHAR(9) NOT NULL,
    warning VARCHAR(9) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    theme_type VARCHAR(20) NOT NULL DEFAULT 'custom'
);

-- ============================================================
-- STEP 4: Create tables in dc_pos schema (POS/Transactions)
-- ============================================================

-- Users (caissiers)
CREATE TABLE dc_pos.users (
    id VARCHAR(255) PRIMARY KEY,
    key VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parameters
CREATE TABLE dc_pos.parameters (
    id SERIAL PRIMARY KEY,
    param_key VARCHAR(255) NOT NULL,
    param_value TEXT
);

-- Currency
CREATE TABLE dc_pos.currency (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    max_value DECIMAL(10,4) DEFAULT NULL,
    decimals INTEGER DEFAULT 2,
    rate DECIMAL(10,4) DEFAULT '0.00000',
    fee DECIMAL(3,1) DEFAULT '0.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment methods
CREATE TABLE dc_pos.payment_methods (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    address VARCHAR(255) DEFAULT '0',
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Facturation (transactions)
CREATE TABLE dc_pos.facturation (
    id SERIAL PRIMARY KEY,
    panier_id VARCHAR(255),
    user_id VARCHAR(255),
    payment_method_id INTEGER,
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency_id INTEGER,
    note TEXT,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL,
    FOREIGN KEY (payment_method_id) REFERENCES dc_pos.payment_methods(id) ON DELETE SET NULL,
    FOREIGN KEY (currency_id) REFERENCES dc_pos.currency(id) ON DELETE SET NULL
);

-- Facturation articles (with DECIMAL quantity support)
CREATE TABLE dc_pos.facturation_article (
    id SERIAL PRIMARY KEY,
    facturation_id INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    discount_unit VARCHAR(10) DEFAULT '%',
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (facturation_id) REFERENCES dc_pos.facturation(id) ON DELETE CASCADE
);

-- Printers
CREATE TABLE dc_pos.printers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45)
);

-- Discounts
CREATE TABLE dc_pos.discounts (
    id SERIAL PRIMARY KEY,
    value DECIMAL(10,2) NOT NULL,
    unity_type VARCHAR(10) NOT NULL, -- '%' or 'currency'
    currency_id INTEGER,
    FOREIGN KEY (currency_id) REFERENCES dc_pos.currency(id) ON DELETE SET NULL
);

-- ============================================================
-- STEP 5: Create tables in dc_sys schema (System)
-- ============================================================

-- Logs
CREATE TABLE dc_sys.logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTA (Over-the-air updates)
CREATE TABLE dc_sys.ota (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    changelog TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Web tokens
CREATE TABLE dc_sys.web_token (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STEP 6: Set default search path
-- ============================================================

-- This allows you to query tables without schema prefix
ALTER DATABASE annette SET search_path TO dc_pos, dc, dc_sys, public;

-- ============================================================
-- STEP 7: Verification
-- ============================================================

SELECT '✅ Database "annette" created with schemas: dc, dc_pos, dc_sys' AS result;

-- Show empty table structure
SELECT 'dc_pos Schema' as schema_name, '' as table_name
UNION ALL
SELECT '', 'users'
UNION ALL
SELECT '', 'payment_methods'
UNION ALL
SELECT '', 'facturation'
UNION ALL
SELECT '', 'facturation_article'
UNION ALL
SELECT '', ''
UNION ALL
SELECT 'dc Schema', ''
UNION ALL
SELECT '', 'article'
UNION ALL
SELECT '', 'categorie'
UNION ALL
SELECT '', 'panier'
UNION ALL
SELECT '', ''
UNION ALL
SELECT 'dc_sys Schema', ''
UNION ALL
SELECT '', 'logs'
UNION ALL
SELECT '', 'ota'
UNION ALL
SELECT '', 'web_token';

SELECT '📝 Next: Import your Firestore data using firestore-to-postgres.ts' AS next_step;
