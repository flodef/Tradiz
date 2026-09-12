-- =====================================================================
-- NF525 hardening — MariaDB
-- =====================================================================
-- Run as the MariaDB root/admin user, AFTER testing on a staging copy.
--
-- What it does:
--   1. Creates a restricted user `tradiz_app` for the application.
--   2. Grants full CRUD on configuration/system tables, but only the
--      privileges the app actually needs on fiscal tables.
--   3. Adds BEFORE UPDATE/DELETE triggers that make the append-only fiscal
--      tables immutable — they fire for EVERY user, including root, so a
--      careless admin session can't silently rewrite sealed data.
--
-- After applying, switch the application to the new credentials:
--   DB_USER=tradiz_app  DB_PASSWORD=<the password you set below>
-- Scripts and migrations (TRUNCATE rechain, schema changes) must keep
-- running as an admin user — tradiz_app intentionally cannot DROP or
-- TRUNCATE the closure tables.
--
-- Rollback: run the statements in the "ROLLBACK" section at the bottom,
-- then switch DB_USER back.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Restricted application user
-- ---------------------------------------------------------------------
-- ⚠️  Replace the password before running. Adjust the host pattern to your
--     deployment ('%' = any host, 'localhost' = same machine only).
CREATE USER IF NOT EXISTS 'tradiz_app'@'%' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';

-- ---------------------------------------------------------------------
-- 2. Table privileges
-- ---------------------------------------------------------------------

-- DC + DC_SYS hold only configuration/public/system data — full CRUD.
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC`.* TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_SYS`.* TO 'tradiz_app'@'%';

-- DC_POS configuration tables — full CRUD (the app syncs them with
-- delete-and-reinsert).
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`users` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`devices` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`customers` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`companies` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`parameters` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`currencies` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`payment_methods` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`printers` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`discounts` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON `DC_POS`.`reviews` TO 'tradiz_app'@'%';

-- transactions: the app only INSERTs and UPDATEs (logical delete via
-- payment_method, rechain via hash). Physical DELETE is never legitimate.
GRANT SELECT, INSERT, UPDATE ON `DC_POS`.`transactions` TO 'tradiz_app'@'%';

-- transaction_items: the sync does DELETE + re-INSERT; the
-- `transaction_items_replaced` audit event captures the prior state.
GRANT SELECT, INSERT, DELETE ON `DC_POS`.`transaction_items` TO 'tradiz_app'@'%';

-- Append-only fiscal/history tables: read + write, never update, never delete.
GRANT SELECT, INSERT ON `DC_POS`.`audit_events` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT ON `DC_POS`.`product_price_history` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT ON `DC_POS`.`balance_history` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT ON `DC_POS`.`daily_closures` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT ON `DC_POS`.`monthly_closures` TO 'tradiz_app'@'%';
GRANT SELECT, INSERT ON `DC_POS`.`annual_closures` TO 'tradiz_app'@'%';

-- perpetual_totals is updated in place (running totals) — UPDATE required.
GRANT SELECT, INSERT, UPDATE ON `DC_POS`.`perpetual_totals` TO 'tradiz_app'@'%';

FLUSH PRIVILEGES;

-- ---------------------------------------------------------------------
-- 3. Append-only triggers (fire for every user, including root)
-- ---------------------------------------------------------------------
USE `DC_POS`;

DELIMITER //

DROP TRIGGER IF EXISTS no_update_audit_events//
CREATE TRIGGER no_update_audit_events
    BEFORE UPDATE ON audit_events
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_audit_events//
CREATE TRIGGER no_delete_audit_events
    BEFORE DELETE ON audit_events
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_events is append-only — DELETE is not allowed';
END//

DROP TRIGGER IF EXISTS no_update_product_price_history//
CREATE TRIGGER no_update_product_price_history
    BEFORE UPDATE ON product_price_history
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product_price_history is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_product_price_history//
CREATE TRIGGER no_delete_product_price_history
    BEFORE DELETE ON product_price_history
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'product_price_history is append-only — DELETE is not allowed';
END//

DROP TRIGGER IF EXISTS no_update_balance_history//
CREATE TRIGGER no_update_balance_history
    BEFORE UPDATE ON balance_history
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'balance_history is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_balance_history//
CREATE TRIGGER no_delete_balance_history
    BEFORE DELETE ON balance_history
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'balance_history is append-only — DELETE is not allowed';
END//

DROP TRIGGER IF EXISTS no_update_daily_closures//
CREATE TRIGGER no_update_daily_closures
    BEFORE UPDATE ON daily_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'daily_closures is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_daily_closures//
CREATE TRIGGER no_delete_daily_closures
    BEFORE DELETE ON daily_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'daily_closures is append-only — DELETE is not allowed';
END//

DROP TRIGGER IF EXISTS no_update_monthly_closures//
CREATE TRIGGER no_update_monthly_closures
    BEFORE UPDATE ON monthly_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'monthly_closures is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_monthly_closures//
CREATE TRIGGER no_delete_monthly_closures
    BEFORE DELETE ON monthly_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'monthly_closures is append-only — DELETE is not allowed';
END//

DROP TRIGGER IF EXISTS no_update_annual_closures//
CREATE TRIGGER no_update_annual_closures
    BEFORE UPDATE ON annual_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'annual_closures is append-only — UPDATE is not allowed';
END//

DROP TRIGGER IF EXISTS no_delete_annual_closures//
CREATE TRIGGER no_delete_annual_closures
    BEFORE DELETE ON annual_closures
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'annual_closures is append-only — DELETE is not allowed';
END//

-- Physical DELETE on transactions is never legitimate (logical delete only).
DROP TRIGGER IF EXISTS no_delete_transactions//
CREATE TRIGGER no_delete_transactions
    BEFORE DELETE ON transactions
    FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'transactions is append-only — DELETE is not allowed (use logical delete)';
END//

DELIMITER ;

-- =====================================================================
-- ROLLBACK (admin only) — run this to revert:
--
--   USE `DC_POS`;
--   DROP TRIGGER IF EXISTS no_update_audit_events;
--   DROP TRIGGER IF EXISTS no_delete_audit_events;
--   DROP TRIGGER IF EXISTS no_update_product_price_history;
--   DROP TRIGGER IF EXISTS no_delete_product_price_history;
--   DROP TRIGGER IF EXISTS no_update_balance_history;
--   DROP TRIGGER IF EXISTS no_delete_balance_history;
--   DROP TRIGGER IF EXISTS no_update_daily_closures;
--   DROP TRIGGER IF EXISTS no_delete_daily_closures;
--   DROP TRIGGER IF EXISTS no_update_monthly_closures;
--   DROP TRIGGER IF EXISTS no_delete_monthly_closures;
--   DROP TRIGGER IF EXISTS no_update_annual_closures;
--   DROP TRIGGER IF EXISTS no_delete_annual_closures;
--   DROP TRIGGER IF EXISTS no_delete_transactions;
--   DROP USER IF EXISTS 'tradiz_app'@'%';
--
-- Then point DB_USER back to the previous account.
-- =====================================================================
