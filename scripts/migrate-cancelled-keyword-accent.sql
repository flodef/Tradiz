-- Migration: Normalize 'ANNULEE' → 'ANNULÉE' in transactions table.
--
-- The CANCELLED_KEYWORD constant was initially 'ANNULEE' (no accent) and later
-- corrected to 'ANNULÉE'. Any rows written during the interim period need to
-- be updated so they match the constant and are correctly filtered.
--
-- This file contains sections for BOTH MariaDB/MySQL and PostgreSQL.
-- Run only the section that matches your database engine.

-- ========================================================================
-- MariaDB / MySQL  —  run only this section if you use MariaDB/MySQL
-- ========================================================================
UPDATE transactions SET payment_method = 'ANNULÉE' WHERE payment_method = 'ANNULEE';

-- ========================================================================
-- PostgreSQL  —  run only this section if you use PostgreSQL
-- ========================================================================
UPDATE dc_pos.transactions SET payment_method = 'ANNULÉE' WHERE payment_method = 'ANNULEE';
