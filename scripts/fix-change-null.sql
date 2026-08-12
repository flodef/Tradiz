-- Set change to NULL where it's empty or where the change amount is exactly 0.
-- The "change" column stores a JSON blob like {"cashAmount":50,"change":0} when
-- the customer paid the exact amount (no monnaie to give back).

-- === MariaDB ===
-- UPDATE transactions SET `change` = NULL WHERE `change` = '' OR `change` LIKE '%"change":0%';

-- === PostgreSQL ===
-- UPDATE dc_pos.transactions SET change = NULL WHERE change = '' OR change LIKE '%"change":0%';
