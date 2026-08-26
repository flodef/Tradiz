-- Migration: add hardware config columns to devices table
-- Stores per-device COM ports and baud rates for backscreen (customer display),
-- local thermal printer, and cash drawer.

-- PostgreSQL
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS backscreen_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS backscreen_baud INTEGER DEFAULT NULL;
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS printer_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS printer_baud INTEGER DEFAULT NULL;
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS cash_drawer_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE dc_pos.devices ADD COLUMN IF NOT EXISTS cash_drawer_baud INTEGER DEFAULT NULL;

-- MariaDB
ALTER TABLE devices ADD COLUMN IF NOT EXISTS backscreen_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS backscreen_baud INT(11) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS printer_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS printer_baud INT(11) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cash_drawer_com VARCHAR(10) DEFAULT NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cash_drawer_baud INT(11) DEFAULT NULL;
