-- ============================================================
-- De-duplicate products with similar names and same price
-- Keeps the product with the longer name (e.g. "pain au chocolat" over "pain chocolat")
-- Updates all references before deleting the duplicate.
-- ============================================================
-- DRY RUN: Run the SELECT section first to preview what will be merged.
-- MERGE:   Uncomment the UPDATE/DELETE section at the bottom to execute.
-- ============================================================

USE `DC`;

-- Step 1: Preview duplicates (dry run)
-- Finds pairs in the same category with the same price where one normalized name
-- is a substring of the other. Stop words (au, le, la, de, les, des, un, une, du, la, l)
-- are removed before comparison.
SELECT
    p_keep.id          AS keep_id,
    p_keep.name        AS keep_name,
    p_del.id           AS delete_id,
    p_del.name         AS delete_name,
    p_keep.price       AS price,
    c.name             AS category
FROM products p_del
JOIN products p_keep
    ON p_del.category_id = p_keep.category_id
   AND p_del.price = p_keep.price
   AND p_del.id < p_keep.id
   AND CHAR_LENGTH(p_keep.name) >= CHAR_LENGTH(p_del.name)
LEFT JOIN categories c ON c.id = p_keep.category_id
WHERE
    -- Normalized names: lowercase, remove stop words, collapse spaces
    -- Check if the shorter name is a substring of the longer name (after normalization)
    LOCATE(
        TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            LOWER(p_del.name),
        ' au ', ' '), ' le ', ' '), ' la ', ' '), ' de ', ' '), ' les ', ' '),
        ' des ', ' '), ' un ', ' '), ' une ', ' '), ' du ', ' ')),
        TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
            LOWER(p_keep.name),
        ' au ', ' '), ' le ', ' '), ' la ', ' '), ' de ', ' '), ' les ', ' '),
        ' des ', ' '), ' un ', ' '), ' une ', ' '), ' du ', ' '))
    ) > 0
    -- Exclude exact same name (those should be caught by the unique constraint)
    AND p_del.name != p_keep.name
ORDER BY c.name, p_keep.name;

-- ============================================================
-- Step 2: Execute the merge (uncomment to run)
-- ============================================================

-- -- Create a mapping table: delete_id → keep_id
-- CREATE TEMPORARY TABLE IF NOT EXISTS _dedup_map AS
-- SELECT
--     p_del.id  AS delete_id,
--     p_keep.id AS keep_id
-- FROM products p_del
-- JOIN products p_keep
--     ON p_del.category_id = p_keep.category_id
--    AND p_del.price = p_keep.price
--    AND p_del.id < p_keep.id
--    AND CHAR_LENGTH(p_keep.name) >= CHAR_LENGTH(p_del.name)
-- WHERE
--     LOCATE(
--         TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
--             LOWER(p_del.name),
--         ' au ', ' '), ' le ', ' '), ' la ', ' '), ' de ', ' '), ' les ', ' '),
--         ' des ', ' '), ' un ', ' '), ' une ', ' '), ' du ', ' ')),
--         TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
--             LOWER(p_keep.name),
--         ' au ', ' '), ' le ', ' '), ' la ', ' '), ' de ', ' '), ' les ', ' '),
--         ' des ', ' '), ' un ', ' '), ' une ', ' '), ' du ', ' '))
--     ) > 0
--     AND p_del.name != p_keep.name;
--
-- -- Show the mapping
-- SELECT * FROM _dedup_map;
--
-- -- Update transaction_items
-- UPDATE transaction_items ti
-- JOIN _dedup_map m ON ti.product_id = m.delete_id
-- SET ti.product_id = m.keep_id;
--
-- -- Update rel_formula_element_product
-- UPDATE rel_formula_element_product r
-- JOIN _dedup_map m ON r.product_id = m.delete_id
-- SET r.product_id = m.keep_id;
--
-- -- Update rel_order_formula_element
-- UPDATE rel_order_formula_element r
-- JOIN _dedup_map m ON r.product_id = m.delete_id
-- SET r.product_id = m.keep_id;
--
-- -- Merge order_count into the kept product
-- UPDATE products p_keep
-- JOIN (
--     SELECT m.keep_id, SUM(p.order_count) AS total_count
--     FROM products p
--     JOIN _dedup_map m ON p.id = m.delete_id
--     GROUP BY m.keep_id
-- ) s ON p_keep.id = s.keep_id
-- SET p_keep.order_count = p_keep.order_count + s.total_count;
--
-- -- Delete the duplicates
-- DELETE p FROM products p
-- JOIN _dedup_map m ON p.id = m.delete_id;
--
-- -- Clean up
-- DROP TEMPORARY TABLE IF EXISTS _dedup_map;
--
-- SELECT 'De-duplication complete' AS status;
