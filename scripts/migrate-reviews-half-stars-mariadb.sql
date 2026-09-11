-- ============================================================
-- Migration (MariaDB): Change reviews.rating from INTEGER to DECIMAL(2,1)
-- to support half-star ratings (0.5 increments).
--
-- This script is IDEMPOTENT: it uses IF EXISTS checks and can be
-- safely rerun. Existing integer ratings are preserved (1 → 1.0, etc.)
-- ============================================================

-- Drop the old CHECK constraint if it exists, then change the column type
ALTER TABLE `reviews` DROP CHECK IF EXISTS `reviews_rating_check`;
ALTER TABLE `reviews` MODIFY COLUMN `rating` DECIMAL(2,1) NOT NULL;
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_rating_check` CHECK (`rating` >= 0.5 AND `rating` <= 5);
