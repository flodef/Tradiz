-- Migration: add printer_id to categories table
-- Run this once on each POS database.

-- PostgreSQL
ALTER TABLE dc.categories ADD COLUMN IF NOT EXISTS printer_id INTEGER REFERENCES dc_pos.printers(id) ON DELETE SET NULL;

-- MariaDB (run separately if using MariaDB)
-- ALTER TABLE categories ADD COLUMN printer_id int(11) DEFAULT NULL;
-- ALTER TABLE categories ADD KEY printer_id (printer_id);
-- ALTER TABLE categories ADD CONSTRAINT fk_categories_printer FOREIGN KEY (printer_id) REFERENCES printers (id) ON DELETE SET NULL;
