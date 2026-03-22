-- Script to safely remove duplicate transactions from facturation table
-- This script:
-- 1. Identifies duplicates based on created_at timestamp
-- 2. Reassigns articles from duplicate entries to the first entry
-- 3. Deletes the duplicate facturation records

-- Step 1: Create a temporary table with duplicate mappings
CREATE TEMPORARY TABLE IF NOT EXISTS duplicate_mapping AS
SELECT 
    MIN(t1.id) as keep_id,
    t2.id as duplicate_id
FROM facturation t1
INNER JOIN facturation t2 
    ON t1.created_at = t2.created_at 
    AND t1.id < t2.id
GROUP BY t2.id;

-- Step 2: Show what will be affected (for verification)
SELECT 
    CONCAT('Will reassign ', COUNT(*), ' articles from duplicate transactions') as summary
FROM facturation_article fa
INNER JOIN duplicate_mapping dm ON fa.facturation_id = dm.duplicate_id;

-- Step 3: Reassign articles from duplicates to the original transaction
UPDATE facturation_article fa
INNER JOIN duplicate_mapping dm ON fa.facturation_id = dm.duplicate_id
SET fa.facturation_id = dm.keep_id;

-- Step 4: Delete duplicate facturation records
DELETE f FROM facturation f
INNER JOIN duplicate_mapping dm ON f.id = dm.duplicate_id;

-- Step 5: Show results
SELECT 
    CONCAT('Cleaned up ', ROW_COUNT(), ' duplicate transactions') as result;

-- Step 6: Clean up temporary table
DROP TEMPORARY TABLE IF EXISTS duplicate_mapping;
