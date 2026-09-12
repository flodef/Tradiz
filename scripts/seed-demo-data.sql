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
    (2, 'Boulanger', 'Kitchen', NULL, CURRENT_TIMESTAMP),
    (3, 'Pâtissier', 'Cashier', NULL, CURRENT_TIMESTAMP),
    (4, 'Vendeur', 'Service', NULL, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role;

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
    ('vatNumber', 'FR00000000000', CURRENT_TIMESTAMP),
    ('naf', '5610.C', CURRENT_TIMESTAMP),
    ('legalForm', 'SARL', CURRENT_TIMESTAMP),
    ('legalRepresentative', 'Jean Dupont', CURRENT_TIMESTAMP),
    ('thanksMessage', 'Merci de votre visite !', CURRENT_TIMESTAMP),
    ('mercurial', 'Aucune', CURRENT_TIMESTAMP),
    ('closingHour', '0', CURRENT_TIMESTAMP),
    ('yearStartDate', '{"month":1,"day":1}', CURRENT_TIMESTAMP),
    -- All product settings enabled
    ('productsSettings', '{"useVatPerProduct":true,"useReference":true,"useStock":true,"usePhoto":true,"useDescription":true,"useOptions":true,"useColor":true,"useEmployerShare":true}', CURRENT_TIMESTAMP),
    -- All search settings enabled
    ('searchSettings', '{"searchCustomers":true,"searchProducts":true,"searchUsers":true}', CURRENT_TIMESTAMP),
    -- All display settings enabled
    ('displaySettings', '{"showWaiting":true,"showRefund":true,"showProvision":true,"showDebit":true,"showChange":true,"catalogMode":true,"useTakeOut":true,"paymentIconsMode":true,"displayOthers":true}', CURRENT_TIMESTAMP),
    ('userSwitch', 'true', CURRENT_TIMESTAMP),
    ('useVirtualKeyboard', 'true', CURRENT_TIMESTAMP),
    ('fidelityRate', '0', CURRENT_TIMESTAMP),
    ('logo', 'https://images.unsplash.com/photo-1655662844344-ddfa82992c4d?fm=jpg&q=60&w=200&auto=format&fit=crop', CURRENT_TIMESTAMP),
    ('shopImage', 'https://images.unsplash.com/photo-1635935262420-5f39c154c5ba?fm=jpg&q=60&w=800&auto=format&fit=crop', CURRENT_TIMESTAMP),
    ('openingHours', '{"0":[{"open":"06:00","close":"19:00"}],"1":[{"open":"06:00","close":"19:00"}],"2":[{"open":"06:00","close":"19:00"}],"3":[{"open":"06:00","close":"19:00"}],"4":[{"open":"06:00","close":"19:00"}],"5":[{"open":"06:00","close":"19:00"}],"6":[{"open":"06:00","close":"12:00"}]}', CURRENT_TIMESTAMP),
    ('reservationPhone', 'true', CURRENT_TIMESTAMP),
    ('reservationEmail', 'true', CURRENT_TIMESTAMP),
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
INSERT INTO dc_pos.currencies (id, label, symbol, max_value, decimals, rate, fee, created_at) VALUES
    (1, 'Euro', '€', 999.99, 2, 1.0, 0.0, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Companies
-- ============================================================
INSERT INTO dc_pos.companies (id, name, employer_share, siret, vat_number, address, zip_code, city, created_at) VALUES
    (1, 'Mairie de Quimper', 8.00, '12345678900015', 'FR12345678901', '1 Place Saint-Corentin', '29000', 'QUIMPER', CURRENT_TIMESTAMP),
    (2, 'Entreprise Dupont SARL', 6.00, '98765432100049', 'FR98765432101', '5 Rue du Marché', '29000', 'QUIMPER', CURRENT_TIMESTAMP),
    (3, 'Crèche Les Lutins', 5.00, '45678912300076', 'FR45678912301', '10 Rue des Enfants', '29000', 'QUIMPER', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO UPDATE SET employer_share = EXCLUDED.employer_share, siret = EXCLUDED.siret;

-- ============================================================
-- Customers
-- ============================================================
INSERT INTO dc_pos.customers (id, first_name, last_name, reference, email, phone, company, balance, fidelity_points, created_at) VALUES
    (1, 'Marie', 'Martin', 'CUST001', 'marie.martin@email.fr', '0612345678', 'Mairie de Quimper', 25.50, 120.00, CURRENT_TIMESTAMP),
    (2, 'Pierre', 'Le Gall', 'CUST002', 'pierre.legall@email.fr', '0623456789', 'Entreprise Dupont SARL', 0.00, 45.00, CURRENT_TIMESTAMP),
    (3, 'Sophie', 'Kervennic', 'CUST003', 'sophie.k@email.fr', '0634567890', NULL, -5.00, 230.50, CURRENT_TIMESTAMP),
    (4, 'Luc', 'Fournier', 'CUST004', 'luc.fournier@email.fr', '0645678901', 'Crèche Les Lutins', 100.00, 15.00, CURRENT_TIMESTAMP),
    (5, 'Anne', 'Le Bris', 'CUST005', 'anne.lebris@email.fr', '0656789012', NULL, 0.00, 0.00, CURRENT_TIMESTAMP),
    (6, 'Yann', 'Tanguy', 'CUST006', 'yann.tanguy@email.fr', '0667890123', 'Mairie de Quimper', 12.30, 67.00, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Discounts
-- ============================================================
INSERT INTO dc_pos.discounts (id, value, unity) VALUES
    (1, 5.00, '%'),
    (2, 10.00, '%'),
    (3, 15.00, '%'),
    (4, 1.00, '€'),
    (5, 2.00, '€')
ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, unity = EXCLUDED.unity;

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
    (2, 1, 'Baguette tradition', 1.30, '', 50, 1, 'Baguette de tradition française', 5.5, '#d97706'),
    (3, 2, 'Pain de campagne', 2.50, '', 30, 1, 'Pain de campagne 500g', 5.5, '#92400e'),
    (4, 3, 'Pain complet', 2.80, '', 20, 1, 'Pain complet 500g', 5.5, '#78350f'),
    (5, 4, 'Pain aux céréales', 3.20, '', 15, 1, 'Pain aux 5 céréales', 5.5, '#a16207'),
    (6, 5, 'Ficelle', 0.90, '', 40, 1, 'Ficelle fine', 5.5, '#fbbf24'),
    (7, 6, 'Pain de mie', 2.20, '', 10, 1, 'Pain de mie 500g', 5.5, '#fcd34d')
ON CONFLICT (id) DO NOTHING;

-- Viennoiseries (category 2)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (8, 0, 'Croissant', 1.10, '', 40, 2, 'Croissant pur beurre', 5.5, '#fbbf24'),
    (9, 1, 'Croissant amande', 1.60, '', 20, 2, 'Croissant aux amandes', 5.5, '#fcd34d'),
    (10, 2, 'Pain au chocolat', 1.10, '', 40, 2, 'Pain au chocolat', 5.5, '#f59e0b'),
    (11, 3, 'Chausson aux pommes', 1.80, '', 15, 2, 'Chausson aux pommes maison', 5.5, '#d97706'),
    (12, 4, 'Brioche', 2.50, '', 10, 2, 'Brioche 300g', 5.5, '#fde68a'),
    (13, 5, 'Chouquette (x6)', 1.50, '', 30, 2, '6 chouquettes sucre', 5.5, '#fef3c7'),
    (14, 6, 'Beignet', 1.40, '', 20, 2, 'Beignet sucre', 5.5, '#fbbf24')
ON CONFLICT (id) DO NOTHING;

-- Pâtisseries (category 3)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (15, 0, 'Éclair chocolat', 2.80, '', 10, 3, 'Éclair au chocolat', 10, '#a78bfa'),
    (16, 1, 'Éclair café', 2.80, '', 10, 3, 'Éclair au café', 10, '#8b5cf6'),
    (17, 2, 'Tarte aux pommes', 2.50, '', 8, 3, 'Part de tarte aux pommes', 10, '#7c3aed'),
    (18, 3, 'Tarte citron', 2.80, '', 6, 3, 'Part de tarte au citron meringuée', 10, '#6d28d9'),
    (19, 4, 'Mille-feuille', 3.20, '', 6, 3, 'Mille-feuille vanille', 10, '#5b21b6'),
    (20, 5, 'Paris-Brest', 3.20, '', 6, 3, 'Paris-Brest praline', 10, '#a78bfa'),
    (21, 6, 'Macaron (x1)', 0.90, '', 50, 3, 'Macaron au choix', 10, '#c4b5fd'),
    (22, 7, 'Religieuse chocolat', 3.50, '', 4, 3, 'Religieuse au chocolat', 10, '#8b5cf6')
ON CONFLICT (id) DO NOTHING;

-- Épicerie (category 4)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (23, 0, 'Farine 1kg', 1.50, '', 20, 4, 'Farine de blé T55 1kg', 5.5, '#84cc16'),
    (24, 1, 'Levure boulangère', 0.80, '', 30, 4, 'Sachet de levure', 5.5, '#65a30d'),
    (25, 2, 'Miel 250g', 6.50, '', 15, 4, 'Pot de miel 250g', 5.5, '#a3e635'),
    (26, 3, 'Confiture artisanale', 4.50, '', 20, 4, 'Pot de confiture 300g', 5.5, '#4d7c0f'),
    (27, 4, 'Huile d''olive 500ml', 8.90, '', 10, 4, 'Huile d''olive vierge', 5.5, '#84cc16'),
    (28, 5, 'Sel de Guérande', 3.20, '', 25, 4, 'Sel de Guérande 500g', 5.5, '#bef264')
ON CONFLICT (id) DO NOTHING;

-- Boissons (category 5)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (29, 0, 'Eau 50cl', 1.20, '', 50, 5, 'Bouteille d''eau 50cl', 10, '#06b6d4'),
    (30, 1, 'Coca-Cola 33cl', 1.80, '', 40, 5, 'Canette 33cl', 10, '#0891b2'),
    (31, 2, 'Jus d''orange', 2.50, '', 30, 5, 'Jus d''orange pressé 25cl', 10, '#0e7490'),
    (32, 3, 'Café', 1.30, '', 100, 5, 'Café expresso', 10, '#155e75'),
    (33, 4, 'Thé', 1.50, '', 100, 5, 'Thé au choix', 10, '#06b6d4'),
    (34, 5, 'Chocolat chaud', 2.20, '', 50, 5, 'Chocolat chaud', 10, '#22d3ee')
ON CONFLICT (id) DO NOTHING;

-- Sandwichs (category 6)
INSERT INTO dc.products (id, sort_order, name, price, photo, stock, category_id, description, vat_rate, color) VALUES
    (35, 0, 'Sandwich jambon', 4.50, '', 15, 6, 'Sandwich jambon beurre', 10, '#ef4444'),
    (36, 1, 'Sandwich poulet', 5.00, '', 15, 6, 'Sandwich poulet crudité', 10, '#dc2626'),
    (37, 2, 'Sandwich végétarien', 4.80, '', 10, 6, 'Sandwich légumes', 10, '#b91c1c'),
    (38, 3, 'Quiche lorraine', 3.50, '', 12, 6, 'Part de quiche lorraine', 10, '#f87171'),
    (39, 4, 'Salade composée', 6.50, '', 8, 6, 'Salade composée du jour', 10, '#fca5a5')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Establishment config
-- ============================================================
INSERT INTO dc.establishment_config (id, operation_mode, orange_delay_minutes, red_delay_minutes, kitchen_view_enabled, grafana_access_enabled) VALUES
    (1, 'restaurant', 5, 10, true, true)
ON CONFLICT (id) DO UPDATE SET operation_mode = EXCLUDED.operation_mode, orange_delay_minutes = EXCLUDED.orange_delay_minutes, red_delay_minutes = EXCLUDED.red_delay_minutes, kitchen_view_enabled = EXCLUDED.kitchen_view_enabled, grafana_access_enabled = EXCLUDED.grafana_access_enabled;

-- ============================================================
-- Reset SERIAL sequences to MAX(id) so future inserts don't collide
-- (explicit ID inserts above don't advance the sequence automatically)
-- ============================================================
SELECT setval(pg_get_serial_sequence('dc_pos.users', 'id'), (SELECT MAX(id) FROM dc_pos.users));
SELECT setval(pg_get_serial_sequence('dc_pos.payment_methods', 'id'), (SELECT MAX(id) FROM dc_pos.payment_methods));
SELECT setval(pg_get_serial_sequence('dc_pos.printers', 'id'), (SELECT MAX(id) FROM dc_pos.printers));
SELECT setval(pg_get_serial_sequence('dc_pos.devices', 'id'), (SELECT MAX(id) FROM dc_pos.devices));
SELECT setval(pg_get_serial_sequence('dc_pos.currencies', 'id'), (SELECT MAX(id) FROM dc_pos.currencies));
SELECT setval(pg_get_serial_sequence('dc_pos.companies', 'id'), (SELECT MAX(id) FROM dc_pos.companies));
SELECT setval(pg_get_serial_sequence('dc_pos.customers', 'id'), (SELECT MAX(id) FROM dc_pos.customers));
SELECT setval(pg_get_serial_sequence('dc_pos.discounts', 'id'), (SELECT MAX(id) FROM dc_pos.discounts));
SELECT setval(pg_get_serial_sequence('dc.establishment_config', 'id'), (SELECT MAX(id) FROM dc.establishment_config));
SELECT setval(pg_get_serial_sequence('dc.categories', 'id'), (SELECT MAX(id) FROM dc.categories));
SELECT setval(pg_get_serial_sequence('dc.products', 'id'), (SELECT MAX(id) FROM dc.products));

COMMIT;
