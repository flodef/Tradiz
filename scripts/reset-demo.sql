-- ============================================================
-- Demo shop reset (demo.tradiz.fr)
--
-- Wipes everything a tester may have touched so the seed
-- (seed-demo-data.sql) can re-create a clean state afterwards.
-- Preserved on purpose:
--   - intervention devices + their linked users (service access)
--   - theme_admin / theme_client (not seeded — app defaults apply)
--   - dc_sys.ota_updates
-- Run AFTER this script: psql -f seed-demo-data.sql
-- (or scripts/reset-demo.sh which does both)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Transactional / accumulated data
-- ------------------------------------------------------------
DELETE FROM dc.rel_order_formula_element;
DELETE FROM dc.rel_order_formula;
DELETE FROM dc.rel_order_product;
DELETE FROM dc.rel_table_order;
DELETE FROM dc.orders;
DELETE FROM dc_pos.transaction_items;
DELETE FROM dc_pos.transactions;
DELETE FROM dc_pos.balance_history;
DELETE FROM dc_pos.product_price_history;
DELETE FROM dc_pos.audit_events;
DELETE FROM dc_pos.daily_closures;
DELETE FROM dc_pos.monthly_closures;
DELETE FROM dc_pos.annual_closures;
DELETE FROM dc_pos.perpetual_totals;
DELETE FROM dc_sys.web_tokens;
DELETE FROM dc_sys.logs;
DELETE FROM dc_sys.connections;

-- ------------------------------------------------------------
-- Devices & users
-- ------------------------------------------------------------
-- Visitor devices auto-register again on their next visit
-- (demo auto-registration in resolveUser). Intervention devices
-- are DB-managed and must be kept.
DELETE FROM dc_pos.devices WHERE intervention IS NOT TRUE;
-- Drop tester-created users: keep the seeded ids (1-4) and any user
-- still linked to a remaining (intervention) device.
DELETE FROM dc_pos.users
WHERE id NOT IN (1, 2, 3, 4)
  AND id NOT IN (SELECT user_id FROM dc_pos.devices WHERE user_id IS NOT NULL);

-- ------------------------------------------------------------
-- Config — everything the seed restores
-- ------------------------------------------------------------
DELETE FROM dc.rel_formula_element_product;
DELETE FROM dc.rel_formula_element_formula;
DELETE FROM dc.formula_elements;
DELETE FROM dc.formulas;
DELETE FROM dc.products;
DELETE FROM dc.categories;
DELETE FROM dc.tables;
DELETE FROM dc.walls;
DELETE FROM dc.reviews WHERE shop_id = 'demo';
DELETE FROM dc_pos.customers;
DELETE FROM dc_pos.companies;
DELETE FROM dc_pos.discounts;
DELETE FROM dc_pos.currencies;
DELETE FROM dc_pos.payment_methods;
DELETE FROM dc_pos.printers;
-- A tester may have stopped the subscription or switched plans:
-- wipe it entirely, the seed re-creates the Privilège anchor.
DELETE FROM dc_pos.subscription_events;
DELETE FROM dc_pos.subscription;
DELETE FROM dc_pos.parameters;
DELETE FROM dc.establishment_config;

COMMIT;
