-- ============================================================
-- Create Shop Database with Schema Structure (English Table Names)
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

-- Establishment Config (was: config_etablissement)
CREATE TABLE IF NOT EXISTS dc.establishment_config (
    id SERIAL PRIMARY KEY,
    operation_mode VARCHAR(50) NOT NULL DEFAULT 'restaurant',
    orange_delay_minutes INTEGER DEFAULT 5,
    red_delay_minutes INTEGER DEFAULT 10,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_order_short_number CHAR(3) DEFAULT '0',
    auto_print_kitchen_ticket INTEGER DEFAULT 0,
    kitchen_printer_id INTEGER DEFAULT NULL,
    kitchen_view_enabled BOOLEAN NOT NULL DEFAULT true,
    grafana_access_enabled BOOLEAN NOT NULL DEFAULT true,
    note_printer_id INTEGER DEFAULT NULL
);

-- Products (was: article)
CREATE TABLE IF NOT EXISTS dc.products (
    id SERIAL PRIMARY KEY,
    sort_order INTEGER NOT NULL,
    name VARCHAR(50) NOT NULL DEFAULT '',
    price NUMERIC(8,2) NOT NULL DEFAULT 0.00,
    photo VARCHAR(50) NOT NULL DEFAULT '',
    stock INTEGER DEFAULT NULL,
    reference VARCHAR(255) DEFAULT NULL,
    category_id VARCHAR(50) NOT NULL DEFAULT '',
    description VARCHAR(300) DEFAULT '',
    options VARCHAR(1000) DEFAULT '',
    order_count INTEGER NOT NULL DEFAULT 0,
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00
);

-- Formulas (was: formule)
CREATE TABLE IF NOT EXISTS dc.formulas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(10,2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0
);

-- Formula Elements (was: element_formule)
CREATE TABLE IF NOT EXISTS dc.formula_elements (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id VARCHAR(50) DEFAULT NULL
);

-- Relation: formula_element ↔ formula (was: rel_ef_formule)
CREATE TABLE IF NOT EXISTS dc.rel_formula_element_formula (
    id SERIAL PRIMARY KEY,
    formula_id INTEGER NOT NULL,
    formula_element_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (formula_id) REFERENCES dc.formulas(id) ON DELETE CASCADE,
    FOREIGN KEY (formula_element_id) REFERENCES dc.formula_elements(id) ON DELETE CASCADE
);

-- Relation: formula_element ↔ product (was: rel_ef_article)
CREATE TABLE IF NOT EXISTS dc.rel_formula_element_product (
    id SERIAL PRIMARY KEY,
    formula_element_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (formula_element_id) REFERENCES dc.formula_elements(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES dc.products(id) ON DELETE CASCADE
);

-- Orders (was: panier)
CREATE TABLE IF NOT EXISTS dc.orders (
    id SERIAL PRIMARY KEY,
    short_order_number VARCHAR(50),
    service_type VARCHAR(20) DEFAULT 'on_site',
    done BOOLEAN NOT NULL DEFAULT false,
    paid BOOLEAN NOT NULL DEFAULT false,
    given_at TIMESTAMP,
    preparation_started_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notification_token VARCHAR(200)
);

-- Relation: order ↔ product (was: rel_panier_article)
CREATE TABLE IF NOT EXISTS dc.rel_order_product (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    category_name VARCHAR(255),
    options TEXT,
    paid_at TIMESTAMP,
    kitchen_view BOOLEAN NOT NULL DEFAULT false,
    checked BOOLEAN NOT NULL DEFAULT false,
    item_id VARCHAR(32),
    FOREIGN KEY (order_id) REFERENCES dc.orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES dc.products(id) ON DELETE CASCADE
);

-- Relation: order ↔ formula (was: rel_panier_formule)
CREATE TABLE IF NOT EXISTS dc.rel_order_formula (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL,
    formula_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    note TEXT,
    paid_at TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES dc.orders(id) ON DELETE CASCADE,
    FOREIGN KEY (formula_id) REFERENCES dc.formulas(id) ON DELETE CASCADE
);

-- Relation: order_formula ↔ elements (was: rel_pf_ef)
CREATE TABLE IF NOT EXISTS dc.rel_order_formula_element (
    id SERIAL PRIMARY KEY,
    order_formula_id INTEGER NOT NULL,
    formula_element_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    category_name VARCHAR(255),
    options TEXT,
    kitchen_view BOOLEAN NOT NULL DEFAULT false,
    checked BOOLEAN NOT NULL DEFAULT false,
    item_id VARCHAR(32),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preparation_started_at TIMESTAMP,
    FOREIGN KEY (order_formula_id) REFERENCES dc.rel_order_formula(id) ON DELETE CASCADE,
    FOREIGN KEY (formula_element_id) REFERENCES dc.formula_elements(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES dc.products(id) ON DELETE CASCADE
);

-- Walls (was: mur)
CREATE TABLE IF NOT EXISTS dc.walls (
    id SERIAL PRIMARY KEY,
    x1 INTEGER NOT NULL,
    y1 INTEGER NOT NULL,
    x2 INTEGER NOT NULL,
    y2 INTEGER NOT NULL,
    color VARCHAR(50) DEFAULT '#252535'
);

-- Relation: table ↔ order (was: rel_table_panier)
CREATE TABLE IF NOT EXISTS dc.rel_table_order (
    table_id VARCHAR(16) NOT NULL,
    order_id INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rel_table_order ON dc.rel_table_order(order_id, table_id);

-- Tables (was: table - reserved keyword)
CREATE TABLE IF NOT EXISTS dc.tables (
    id INTEGER PRIMARY KEY,
    state VARCHAR(50) DEFAULT 'ready',
    visible INTEGER DEFAULT 0,
    service_request INTEGER DEFAULT 0,
    new_order_notification INTEGER DEFAULT 0,
    qr_data VARCHAR(64) DEFAULT '',
    password3d VARCHAR(3) DEFAULT NULL,
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0,
    flash_count INTEGER DEFAULT 0,
    order_count INTEGER DEFAULT 0,
    guest_count INTEGER DEFAULT NULL,
    code_updated_at TIMESTAMP DEFAULT NULL
);

-- Admin Themes
CREATE TABLE IF NOT EXISTS dc.theme_admin (
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

-- Client Themes
CREATE TABLE IF NOT EXISTS dc.theme_client (
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

-- Users (cashiers) - default name is 'Comptoir' (handled in app code)
CREATE TABLE IF NOT EXISTS dc_pos.users (
    id SERIAL PRIMARY KEY,
    key VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
    reference VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS dc_pos.customers (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    reference VARCHAR(255) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parameters
CREATE TABLE IF NOT EXISTS dc_pos.parameters (
    id SERIAL PRIMARY KEY,
    param_key VARCHAR(255) NOT NULL,
    param_value TEXT,
    reference VARCHAR(255) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Currencies (was: currency)
CREATE TABLE IF NOT EXISTS dc_pos.currencies (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    max_value DECIMAL(10,4) DEFAULT NULL,
    decimals INTEGER DEFAULT 2,
    rate DECIMAL(10,4) DEFAULT '0.00000',
    fee DECIMAL(3,1) DEFAULT '0.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Methods
CREATE TABLE IF NOT EXISTS dc_pos.payment_methods (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    address VARCHAR(255) DEFAULT '0',
    currency VARCHAR(10) NOT NULL DEFAULT 'EUR',
    hidden BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions (was: facturation) - with payment_method and currency as strings + hash
CREATE TABLE IF NOT EXISTS dc_pos.transactions (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(255),
    user_name VARCHAR(255) NOT NULL DEFAULT 'Cashier',
    payment_method VARCHAR(50) NOT NULL DEFAULT '',
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    currency VARCHAR(10) NOT NULL DEFAULT '',
    note TEXT,
    hash VARCHAR(64) UNIQUE,
    created_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_method ON dc_pos.transactions(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON dc_pos.transactions(currency);
CREATE INDEX IF NOT EXISTS idx_transactions_hash ON dc_pos.transactions(hash);

-- Transaction Items (was: facturation_article) - with DECIMAL quantity support
CREATE TABLE IF NOT EXISTS dc_pos.transaction_items (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    label VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    discount_unit VARCHAR(10) DEFAULT '%',
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES dc_pos.transactions(id) ON DELETE CASCADE
);

-- Printers
CREATE TABLE IF NOT EXISTS dc_pos.printers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45)
);

-- Discounts
CREATE TABLE IF NOT EXISTS dc_pos.discounts (
    id SERIAL PRIMARY KEY,
    value DECIMAL(10,2) NOT NULL,
    unity VARCHAR(10) NOT NULL -- '%' or 'currency'
);

-- Users (default name is 'Comptoir' - handled in app code)
CREATE TABLE IF NOT EXISTS dc_pos.users (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Cashier',
    reference VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customers
CREATE TABLE IF NOT EXISTS dc_pos.customers (
    id SERIAL PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    reference VARCHAR(255) DEFAULT NULL,
    email VARCHAR(255) DEFAULT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- STEP 5: Create tables in dc_sys schema (System)
-- ============================================================

-- Logs (was: log) - Used for system logs and access tracking
CREATE TABLE IF NOT EXISTS dc_sys.logs (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on level for filtering by log level
CREATE INDEX IF NOT EXISTS idx_logs_level ON dc_sys.logs(level);
-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON dc_sys.logs(created_at DESC);

-- OTA (Over-the-air updates) (was: ota)
CREATE TABLE IF NOT EXISTS dc_sys.ota_updates (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    changelog TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Web Tokens (was: web_token)
CREATE TABLE IF NOT EXISTS dc_sys.web_tokens (
    id SERIAL PRIMARY KEY,
    token VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
