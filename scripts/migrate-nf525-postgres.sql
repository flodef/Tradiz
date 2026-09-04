-- NF525 Compliance Migration Script
-- Run this script on existing databases to add NF525 compliance tables
-- and the previous_hash column to the transactions table.

-- ============================================================
-- 1. Add previous_hash column to transactions table
-- ============================================================

-- PostgreSQL:
-- ALTER TABLE dc_pos.transactions ADD COLUMN IF NOT EXISTS previous_hash VARCHAR(64);

-- MariaDB:
-- ALTER TABLE `transactions` ADD COLUMN `previous_hash` varchar(64) DEFAULT NULL;

-- ============================================================
-- 2. Create NF525 compliance tables
-- ============================================================

-- PostgreSQL (dc_pos schema):

-- Audit Events
CREATE TABLE IF NOT EXISTS dc_pos.audit_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NOT NULL DEFAULT 'transaction',
    entity_id VARCHAR(255),
    user_name VARCHAR(255) NOT NULL,
    device_id VARCHAR(255),
    detail TEXT,
    event_hash VARCHAR(64),
    previous_event_hash VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON dc_pos.audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON dc_pos.audit_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON dc_pos.audit_events(created_at DESC);

-- Daily Closures
CREATE TABLE IF NOT EXISTS dc_pos.daily_closures (
    id SERIAL PRIMARY KEY,
    closure_date DATE NOT NULL UNIQUE,
    ticket_count INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
    cancellation_count INTEGER NOT NULL DEFAULT 0,
    cancellation_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    refund_count INTEGER NOT NULL DEFAULT 0,
    refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    closure_hash VARCHAR(64),
    previous_closure_hash VARCHAR(64),
    closed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_daily_closures_date ON dc_pos.daily_closures(closure_date);

-- Monthly Closures
CREATE TABLE IF NOT EXISTS dc_pos.monthly_closures (
    id SERIAL PRIMARY KEY,
    closure_month DATE NOT NULL UNIQUE,
    daily_closure_count INTEGER NOT NULL DEFAULT 0,
    ticket_count INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_ht NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_tva NUMERIC(12,2) NOT NULL DEFAULT 0,
    closure_hash VARCHAR(64),
    previous_closure_hash VARCHAR(64),
    closed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_monthly_closures_month ON dc_pos.monthly_closures(closure_month);

-- Annual Closures
CREATE TABLE IF NOT EXISTS dc_pos.annual_closures (
    id SERIAL PRIMARY KEY,
    closure_year INTEGER NOT NULL UNIQUE,
    monthly_closure_count INTEGER NOT NULL DEFAULT 0,
    ticket_count INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_ht NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_tva NUMERIC(14,2) NOT NULL DEFAULT 0,
    closure_hash VARCHAR(64),
    previous_closure_hash VARCHAR(64),
    closed_by VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_annual_closures_year ON dc_pos.annual_closures(closure_year);

-- Perpetual Totals
CREATE TABLE IF NOT EXISTS dc_pos.perpetual_totals (
    id SERIAL PRIMARY KEY,
    total_ticket_count BIGINT NOT NULL DEFAULT 0,
    total_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_ht NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_tva NUMERIC(16,2) NOT NULL DEFAULT 0,
    total_cancellation_count BIGINT NOT NULL DEFAULT 0,
    total_refund_count BIGINT NOT NULL DEFAULT 0,
    last_closure_hash VARCHAR(64),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
