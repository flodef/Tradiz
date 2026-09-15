-- =====================================================================
-- NF525 append-only triggers — PostgreSQL (Neon)
-- =====================================================================
-- Run as the database OWNER, once per shop database (annette, gds, demo...).
-- Idempotent: safe to re-run.
--
-- This is the trigger-only part of harden-nf525-postgres.sql — apply it
-- without switching the application to the restricted `tradiz_app` role.
-- The triggers fire for EVERY role, including the owner, so a careless
-- admin session can't silently rewrite sealed data.
--
-- For a legitimate admin repair, the owner must first run
-- `ALTER TABLE <t> DISABLE TRIGGER ALL;` (and re-enable after).
-- =====================================================================

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
