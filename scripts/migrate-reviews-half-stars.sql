-- ============================================================
-- Migration: Change reviews.rating from INTEGER to NUMERIC(2,1)
-- to support half-star ratings (0.5 increments).
--
-- This script is IDEMPOTENT: it uses IF EXISTS checks and can be
-- safely rerun. Existing integer ratings are preserved (1 → 1.0, etc.)
-- ============================================================

BEGIN;

-- Drop the old CHECK constraint (if it exists) and add the new one
ALTER TABLE dc.reviews DROP CONSTRAINT IF EXISTS reviews_rating_check;
ALTER TABLE dc.reviews ALTER COLUMN rating TYPE NUMERIC(2,1) USING rating::NUMERIC(2,1);
-- Clamp legacy out-of-range values so the new CHECK doesn't abort the migration
UPDATE dc.reviews SET rating = 0.5 WHERE rating < 0.5;
UPDATE dc.reviews SET rating = 5 WHERE rating > 5;
ALTER TABLE dc.reviews ADD CONSTRAINT reviews_rating_check CHECK (rating >= 0.5 AND rating <= 5);

COMMIT;
