-- Migration: Add unique constraint on param_key (PostgreSQL) and resync the
-- parameters_id_seq sequence. Run this script once before deploying the fix
-- for the "duplicate key value violates unique constraint parameters_pkey"
-- error that occurs when the SERIAL sequence falls behind MAX(id).
--
-- PostgreSQL only. MariaDB already has UNIQUE KEY `param_key` (`param_key`).

-- 1. Add a unique constraint on param_key so we can use ON CONFLICT upsert.
--    This matches the MariaDB schema (UNIQUE KEY `param_key`).
-- Remove duplicates (keep the lowest id) before adding the constraint, if any.
DELETE FROM dc_pos.parameters p
WHERE p.id NOT IN (
    SELECT MIN(id) FROM dc_pos.parameters GROUP BY param_key
);

ALTER TABLE dc_pos.parameters
    ADD CONSTRAINT IF NOT EXISTS parameters_param_key_key UNIQUE (param_key);

-- 2. Resync the SERIAL sequence with the current MAX(id).
--    This fixes the root cause of the duplicate key error: the sequence was
--    behind the actual max(id) in the table (e.g. after a manual INSERT or a
--    restore), so the next INSERT tried to reuse an existing id.
SELECT setval(
    pg_get_serial_sequence('dc_pos.parameters', 'id'),
    COALESCE(MAX(id), 0) + 1,
    false
) FROM dc_pos.parameters;
