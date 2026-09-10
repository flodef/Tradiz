-- ============================================================
-- Migration: Create reviews table for GDS
-- Date: 2026-09-10
--
-- This script is IDEMPOTENT: it uses CREATE TABLE IF NOT EXISTS
-- and can be safely rerun.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create reviews table (if not exists)
-- ============================================================
CREATE TABLE IF NOT EXISTS dc.reviews (
    id SERIAL PRIMARY KEY,
    shop_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (shop_id, user_id)
);

-- ============================================================
-- 2. Google Place ID for La gourmandise de Sylvie
-- ============================================================
INSERT INTO dc_pos.parameters (param_key, param_value, updated_at)
VALUES ('googlePlaceId', 'ChIJC4wZunmwFkgRPepN6JSdTMo', CURRENT_TIMESTAMP)
ON CONFLICT (param_key) DO UPDATE
SET param_value = EXCLUDED.param_value, updated_at = CURRENT_TIMESTAMP;

COMMIT;
