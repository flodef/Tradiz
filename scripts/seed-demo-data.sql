-- ============================================================
-- Demo shop seed data (demo.tradiz.fr)
--
-- Fictional boulangerie / épicerie used to let prospects test
-- the Tradiz POS software. Idempotent: ON CONFLICT DO NOTHING.
-- ============================================================

BEGIN;

-- ============================================================
-- Users (cashiers)
-- ============================================================
INSERT INTO dc_pos.users (id, name, role, reference, created_at) VALUES
    (1, 'Démo', 'Admin', NULL, CURRENT_TIMESTAMP),
    (2, 'Boulanger', 'Cashier', NULL, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Parameters (shop identity & settings)
-- ============================================================
INSERT INTO dc_pos.parameters (param_key, param_value, updated_at) VALUES
    ('name', 'Boulangerie Démo Tradiz', CURRENT_TIMESTAMP),
    ('address', '1 Rue de la Démo', CURRENT_TIMESTAMP),
    ('zipCode', '29000', CURRENT_TIMESTAMP),
    ('city', 'QUIMPER', CURRENT_TIMESTAMP),
    ('serial', '00000000000000', CURRENT_TIMESTAMP),
    ('email', 'demo@tradiz.fr', CURRENT_TIMESTAMP),
    ('phone', '0200000000', CURRENT_TIMESTAMP),
    ('thanksMessage', 'Merci de votre visite !', CURRENT_TIMESTAMP),
    ('mercurial', 'Aucune', CURRENT_TIMESTAMP),
    ('closingHour', '0', CURRENT_TIMESTAMP),
    ('yearStartDate', '{"month":1,"day":1}', CURRENT_TIMESTAMP),
    ('vatNumber', 'FR00000000000', CURRENT_TIMESTAMP),
    ('productsSettings', '{"useVatPerProduct":false,"useReference":false,"useStock":true,"usePhoto":true,"useDescription":true,"useOptions":false,"useColor":true,"useEmployerShare":false}', CURRENT_TIMESTAMP),
    ('searchSettings', '{"searchCustomers":true,"searchProducts":true,"searchUsers":false}', CURRENT_TIMESTAMP),
    ('displaySettings', '{"showWaiting":false,"showRefund":true,"showProvision":true,"showDebit":true,"showChange":true,"catalogMode":true,"useTakeOut":true}', CURRENT_TIMESTAMP),
    ('userSwitch', 'true', CURRENT_TIMESTAMP),
    ('useVirtualKeyboard', 'false', CURRENT_TIMESTAMP),
    ('fidelityRate', '0', CURRENT_TIMESTAMP),
    ('logo', '', CURRENT_TIMESTAMP),
    ('shopImage', '', CURRENT_TIMESTAMP),
    ('openingHours', '{"monday":{"open":"06:00","close":"19:00","closed":false},"tuesday":{"open":"06:00","close":"19:00","closed":false},"wednesday":{"open":"06:00","close":"19:00","closed":false},"thursday":{"open":"06:00","close":"19:00","closed":false},"friday":{"open":"06:00","close":"19:00","closed":false},"saturday":{"open":"06:00","close":"19:00","closed":false},"sunday":{"open":"06:00","close":"12:00","closed":false}}', CURRENT_TIMESTAMP),
    ('reservationEnabled', 'true', CURRENT_TIMESTAMP),
    ('reservationPhone', '0200000000', CURRENT_TIMESTAMP),
    ('reservationEmail', 'demo@tradiz.fr', CURRENT_TIMESTAMP),
    ('googlePlaceId', '', CURRENT_TIMESTAMP),
    ('googleReviewUrl', '', CURRENT_TIMESTAMP)
ON CONFLICT (param_key) DO UPDATE SET param_value = EXCLUDED.param_value, updated_at = CURRENT_TIMESTAMP;

-- ============================================================
-- Payment methods
-- ============================================================
INSERT INTO dc_pos.payment_methods (id, label, address, currency, available, created_at) VALUES
    (1, 'Carte Bancaire', '0', 'Euro', true, CURRENT_TIMESTAMP),
    (2, 'Espèces', '0', 'Euro', true, CURRENT_TIMESTAMP),
    (3, 'Chèque', '0', 'Euro', true, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Printers
-- ============================================================
INSERT INTO dc_pos.printers (id, name, ip_address) VALUES
    (1, 'Caisse', 'COM1'),
    (2, 'Cuisine', '192.168.1.50')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Devices
-- ============================================================
INSERT INTO dc_pos.devices (id, label, public_key, user_id, connected, last_seen, created_at) VALUES
    (1, 'Caisse Démo', 'demo-caisse-key-001', 1, false, NULL, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Currencies
-- ============================================================
INSERT INTO dc_pos.currencies (id, label, symbol, rate, created_at) VALUES
    (1, 'Euro', '€', 1.0, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Categories
-- ============================================================
INSERT INTO dc.categories (id, name, sort_order, printer_id, created_at) VALUES
    (1, 'Pains', 0, 1, CURRENT_TIMESTAMP),
    (2, 'Viennoiseries', 1, 1, CURRENT_TIMESTAMP),
    (3, 'Pâtisseries', 2, 1, CURRENT_TIMESTAMP),
    (4, 'Épicerie', 3, NULL, CURRENT_TIMESTAMP),
    (5, 'Boissons', 4, NULL, CURRENT_TIMESTAMP),
    (6, 'Sandwichs', 5, 2, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Products
-- ============================================================
-- Pains (category 1)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (1, 0, 'Baguette', 1.10, '', 50, 1, 'Baguette tradition', 5.5, '#f59e0b'),
    (2, 1, 'Baguette tradition', 1.30, '', 50, 1, 'Baguette de tradition française', 5.5, '#f59e0b'),
    (3, 2, 'Pain de campagne', 2.50, '', 30, 1, 'Pain de campagne 500g', 5.5, '#d97706'),
    (4, 3, 'Pain complet', 2.80, '', 20, 1, 'Pain complet 500g', 5.5, '#92400e'),
    (5, 4, 'Pain aux céréales', 3.20, '', 15, 1, 'Pain aux 5 céréales', 5.5, '#78350f'),
    (6, 5, 'Ficelle', 0.90, '', 40, 1, 'Ficelle fine', 5.5, '#f59e0b'),
    (7, 6, 'Pain de mie', 2.20, '', 10, 1, 'Pain de mie 500g', 5.5, '#fbbf24')
ON CONFLICT (id) DO NOTHING;

-- Viennoiseries (category 2)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (8, 0, 'Croissant', 1.10, '', 40, 2, 'Croissant pur beurre', 5.5, '#fbbf24'),
    (9, 1, 'Croissant amande', 1.60, '', 20, 2, 'Croissant aux amandes', 5.5, '#fbbf24'),
    (10, 2, 'Pain au chocolat', 1.10, '', 40, 2, 'Pain au chocolat', 5.5, '#fbbf24'),
    (11, 3, 'Chausson aux pommes', 1.80, '', 15, 2, 'Chausson aux pommes maison', 5.5, '#fbbf24'),
    (12, 4, 'Brioche', 2.50, '', 10, 2, 'Brioche 300g', 5.5, '#fbbf24'),
    (13, 5, 'Chouquette (x6)', 1.50, '', 30, 2, '6 chouquettes sucre', 5.5, '#fbbf24'),
    (14, 6, 'Beignet', 1.40, '', 20, 2, 'Beignet sucre', 5.5, '#fbbf24')
ON CONFLICT (id) DO NOTHING;

-- Pâtisseries (category 3)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (15, 0, 'Éclair chocolat', 2.80, '', 10, 3, 'Éclair au chocolat', 10, '#a78bfa'),
    (16, 1, 'Éclair café', 2.80, '', 10, 3, 'Éclair au café', 10, '#a78bfa'),
    (17, 2, 'Tarte aux pommes', 2.50, '', 8, 3, 'Part de tarte aux pommes', 10, '#a78bfa'),
    (18, 3, 'Tarte citron', 2.80, '', 6, 3, 'Part de tarte au citron meringuée', 10, '#a78bfa'),
    (19, 4, 'Mille-feuille', 3.20, '', 6, 3, 'Mille-feuille vanille', 10, '#a78bfa'),
    (20, 5, 'Paris-Brest', 3.20, '', 6, 3, 'Paris-Brest praline', 10, '#a78bfa'),
    (21, 6, 'Macaron (x1)', 0.90, '', 50, 3, 'Macaron au choix', 10, '#a78bfa'),
    (22, 7, 'Religieuse chocolat', 3.50, '', 4, 3, 'Religieuse au chocolat', 10, '#a78bfa')
ON CONFLICT (id) DO NOTHING;

-- Épicerie (category 4)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (23, 0, 'Farine 1kg', 1.50, '', 20, 4, 'Farine de blé T55 1kg', 5.5, '#84cc16'),
    (24, 1, 'Levure boulangère', 0.80, '', 30, 4, 'Sachet de levure', 5.5, '#84cc16'),
    (25, 2, 'Miel 250g', 6.50, '', 15, 4, 'Pot de miel 250g', 5.5, '#84cc16'),
    (26, 3, 'Confiture artisanale', 4.50, '', 20, 4, 'Pot de confiture 300g', 5.5, '#84cc16'),
    (27, 4, 'Huile d''olive 500ml', 8.90, '', 10, 4, 'Huile d''olive vierge', 5.5, '#84cc16'),
    (28, 5, 'Sel de Guérande', 3.20, '', 25, 4, 'Sel de Guérande 500g', 5.5, '#84cc16')
ON CONFLICT (id) DO NOTHING;

-- Boissons (category 5)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (29, 0, 'Eau 50cl', 1.20, '', 50, 5, 'Bouteille d''eau 50cl', 10, '#06b6d4'),
    (30, 1, 'Coca-Cola 33cl', 1.80, '', 40, 5, 'Canette 33cl', 10, '#06b6d4'),
    (31, 2, 'Jus d''orange', 2.50, '', 30, 5, 'Jus d''orange pressé 25cl', 10, '#06b6d4'),
    (32, 3, 'Café', 1.30, '', 100, 5, 'Café expresso', 10, '#06b6d4'),
    (33, 4, 'Thé', 1.50, '', 100, 5, 'Thé au choix', 10, '#06b6d4'),
    (34, 5, 'Chocolat chaud', 2.20, '', 50, 5, 'Chocolat chaud', 10, '#06b6d4')
ON CONFLICT (id) DO NOTHING;

-- Sandwichs (category 6)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (35, 0, 'Sandwich jambon', 4.50, '', 15, 6, 'Sandwich jambon beurre', 10, '#ef4444'),
    (36, 1, 'Sandwich poulet', 5.00, '', 15, 6, 'Sandwich poulet crudité', 10, '#ef4444'),
    (37, 2, 'Sandwich végétarien', 4.80, '', 10, 6, 'Sandwich légumes', 10, '#ef4444'),
    (38, 3, 'Quiche lorraine', 3.50, '', 12, 6, 'Part de quiche lorraine', 10, '#ef4444'),
    (39, 4, 'Salade composée', 6.50, '', 8, 6, 'Salade composée du jour', 10, '#ef4444')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Establishment config
-- ============================================================
INSERT INTO dc.establishment_config (operation_mode, orange_delay_minutes, red_delay_minutes, kitchen_view_enabled, grafana_access_enabled) VALUES
    ('restaurant', 5, 10, true, true)
ON CONFLICT (id) DO NOTHING;

COMMIT;
