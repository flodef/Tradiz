-- =====================================================================
-- NF525 hardening — PostgreSQL (Neon)
-- =====================================================================
-- Run as the database OWNER (the Neon-provided role), once per shop
-- database (annette, gds, demo...), AFTER testing on a Neon branch.
--
-- What it does:
--   1. Creates a restricted login role `tradiz_app` for the application.
--   2. Grants full CRUD on configuration/system tables, but only the
--      privileges the app actually needs on fiscal tables.
--   3. Adds BEFORE UPDATE/DELETE triggers that make the append-only fiscal
--      tables immutable — they fire for EVERY role, including the owner,
--      so a careless admin session can't silently rewrite sealed data.
--
-- After applying, switch the application to the new credentials:
--   PG_USER=tradiz_app  PG_PASSWORD=<the password you set below>
-- Scripts and migrations (populate-nf525-tables.ts, create-*.sql, TRUNCATE
-- rechain) must keep running as the OWNER role — tradiz_app intentionally
-- cannot TRUNCATE the closure tables.
--
-- Rollback: run the statements in the "ROLLBACK" section at the bottom,
-- then switch PG_USER back to the owner role.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restricted application role
-- ---------------------------------------------------------------------
-- ⚠️  Replace the password before running. Idempotent: safe to re-run
--     (the ALTER ROLE also serves as password rotation).
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tradiz_app') THEN
        CREATE ROLE tradiz_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
    END IF;
END $$;
ALTER ROLE tradiz_app LOGIN PASSWORD 'CHANGE_ME_STRONG_PASSWORD';

-- CONNECT is granted to PUBLIC by default; if it was revoked on this
-- database, run: GRANT CONNECT ON DATABASE <this_db> TO tradiz_app;
GRANT USAGE ON SCHEMA dc, dc_pos, dc_sys TO tradiz_app;

-- Sequences are required for SERIAL inserts (audit_events.id, closures, ...).
GRANT USAGE ON ALL SEQUENCES IN SCHEMA dc, dc_pos, dc_sys TO tradiz_app;

-- ---------------------------------------------------------------------
-- 2. Table privileges
-- ---------------------------------------------------------------------

-- dc + dc_sys hold only configuration/public data — full CRUD.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dc TO tradiz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA dc_sys TO tradiz_app;

-- dc_pos configuration tables — full CRUD (the app syncs them with
-- delete-and-reinsert).
GRANT SELECT, INSERT, UPDATE, DELETE ON
    dc_pos.users, dc_pos.devices, dc_pos.customers, dc_pos.companies,
    dc_pos.parameters, dc_pos.currencies, dc_pos.payment_methods,
    dc_pos.printers, dc_pos.discounts
TO tradiz_app;

-- transactions: the app only INSERTs and UPDATEs (logical delete via
-- payment_method, rechain via hash). Physical DELETE is never legitimate.
GRANT SELECT, INSERT, UPDATE ON dc_pos.transactions TO tradiz_app;

-- transaction_items: the sync does DELETE + re-INSERT; the
-- `transaction_items_replaced` audit event captures the prior state.
GRANT SELECT, INSERT, DELETE ON dc_pos.transaction_items TO tradiz_app;

-- Append-only fiscal/history tables: read + write, never update, never delete.
GRANT SELECT, INSERT ON dc_pos.audit_events TO tradiz_app;
GRANT SELECT, INSERT ON dc_pos.product_price_history TO tradiz_app;
GRANT SELECT, INSERT ON dc_pos.balance_history TO tradiz_app;
GRANT SELECT, INSERT ON dc_pos.daily_closures TO tradiz_app;
GRANT SELECT, INSERT ON dc_pos.monthly_closures TO tradiz_app;
GRANT SELECT, INSERT ON dc_pos.annual_closures TO tradiz_app;

-- perpetual_totals is updated in place (running totals) — UPDATE required.
GRANT SELECT, INSERT, UPDATE ON dc_pos.perpetual_totals TO tradiz_app;

-- subscription: the app reads + writes the singleton row (plan/status/billing).
GRANT SELECT, INSERT, UPDATE ON dc_pos.subscription TO tradiz_app;
-- subscription_events: append-only billing log.
GRANT SELECT, INSERT ON dc_pos.subscription_events TO tradiz_app;

-- NOTE: `ON ALL TABLES` only covers tables that exist right now. After any
-- migration adding a table to dc/dc_pos/dc_sys, re-run this section (or set
-- up ALTER DEFAULT PRIVILEGES on the owner role) or tradiz_app won't see it.

-- ---------------------------------------------------------------------
-- 3. Append-only triggers (fire for every role, including the owner)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dc_pos.prevent_fiscal_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% on % is not allowed — this NF525 table is append-only', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_audit_events ON dc_pos.audit_events;
CREATE TRIGGER no_update_audit_events
    BEFORE UPDATE OR DELETE ON dc_pos.audit_events
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

DROP TRIGGER IF EXISTS no_update_product_price_history ON dc_pos.product_price_history;
CREATE TRIGGER no_update_product_price_history
    BEFORE UPDATE OR DELETE ON dc_pos.product_price_history
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

DROP TRIGGER IF EXISTS no_update_balance_history ON dc_pos.balance_history;
CREATE TRIGGER no_update_balance_history
    BEFORE UPDATE OR DELETE ON dc_pos.balance_history
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

DROP TRIGGER IF EXISTS no_update_daily_closures ON dc_pos.daily_closures;
CREATE TRIGGER no_update_daily_closures
    BEFORE UPDATE OR DELETE ON dc_pos.daily_closures
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

DROP TRIGGER IF EXISTS no_update_monthly_closures ON dc_pos.monthly_closures;
CREATE TRIGGER no_update_monthly_closures
    BEFORE UPDATE OR DELETE ON dc_pos.monthly_closures
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

DROP TRIGGER IF EXISTS no_update_annual_closures ON dc_pos.annual_closures;
CREATE TRIGGER no_update_annual_closures
    BEFORE UPDATE OR DELETE ON dc_pos.annual_closures
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

-- subscription_events is the billing ledger — append-only too.
DROP TRIGGER IF EXISTS no_update_subscription_events ON dc_pos.subscription_events;
CREATE TRIGGER no_update_subscription_events
    BEFORE UPDATE OR DELETE ON dc_pos.subscription_events
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

-- Physical DELETE on transactions is never legitimate (logical delete only).
DROP TRIGGER IF EXISTS no_delete_transactions ON dc_pos.transactions;
CREATE TRIGGER no_delete_transactions
    BEFORE DELETE ON dc_pos.transactions
    FOR EACH ROW EXECUTE FUNCTION dc_pos.prevent_fiscal_mutation();

-- Row triggers do not fire on TRUNCATE — close that bypass on the two tables
-- that must never be emptied. The closure tables stay truncatable: the
-- owner-run rechain script (populate-nf525-tables.ts --force-rechain) needs it.
CREATE OR REPLACE FUNCTION dc_pos.prevent_fiscal_truncate()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TRUNCATE on % is not allowed — this NF525 table is sealed', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_truncate_transactions ON dc_pos.transactions;
CREATE TRIGGER no_truncate_transactions
    BEFORE TRUNCATE ON dc_pos.transactions
    FOR EACH STATEMENT EXECUTE FUNCTION dc_pos.prevent_fiscal_truncate();

DROP TRIGGER IF EXISTS no_truncate_audit_events ON dc_pos.audit_events;
CREATE TRIGGER no_truncate_audit_events
    BEFORE TRUNCATE ON dc_pos.audit_events
    FOR EACH STATEMENT EXECUTE FUNCTION dc_pos.prevent_fiscal_truncate();

-- NOTE: these triggers fire for every role, including the owner. For a
-- legitimate admin repair (e.g. rehashing audit events), the owner must
-- first run `ALTER TABLE <t> DISABLE TRIGGER ALL;` (and re-enable after).

-- =====================================================================
-- ROLLBACK (owner only) — run this to revert:
--
--   DROP TRIGGER IF EXISTS no_update_audit_events ON dc_pos.audit_events;
--   DROP TRIGGER IF EXISTS no_update_product_price_history ON dc_pos.product_price_history;
--   DROP TRIGGER IF EXISTS no_update_balance_history ON dc_pos.balance_history;
--   DROP TRIGGER IF EXISTS no_update_daily_closures ON dc_pos.daily_closures;
--   DROP TRIGGER IF EXISTS no_update_monthly_closures ON dc_pos.monthly_closures;
--   DROP TRIGGER IF EXISTS no_update_annual_closures ON dc_pos.annual_closures;
--   DROP TRIGGER IF EXISTS no_update_subscription_events ON dc_pos.subscription_events;
--   DROP TRIGGER IF EXISTS no_delete_transactions ON dc_pos.transactions;
--   DROP TRIGGER IF EXISTS no_truncate_transactions ON dc_pos.transactions;
--   DROP TRIGGER IF EXISTS no_truncate_audit_events ON dc_pos.audit_events;
--   DROP FUNCTION IF EXISTS dc_pos.prevent_fiscal_mutation();
--   DROP FUNCTION IF EXISTS dc_pos.prevent_fiscal_truncate();
--   REASSIGN OWNED BY tradiz_app TO <owner>;  -- if it owns nothing, skip
--   DROP ROLE IF EXISTS tradiz_app;
--
-- Then point PG_USER back to the owner role.
-- =====================================================================
