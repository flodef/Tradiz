-- ============================================================
-- Subscription tables migration (PostgreSQL)
-- Adds dc_pos.subscription (current state) and
-- dc_pos.subscription_events (append-only billing log).
-- Idempotent — safe to re-run. Run as the OWNER role.
-- ============================================================

CREATE TABLE IF NOT EXISTS dc_pos.subscription (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    plan VARCHAR(20) NOT NULL DEFAULT 'privilege',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    billing_method VARCHAR(20) NOT NULL DEFAULT 'invoice',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dc_pos.subscription_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(20) NOT NULL,
    plan VARCHAR(20),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at ON dc_pos.subscription_events(created_at);

-- Seed the singleton row for existing shops (defaults to the highest plan so
-- deployed shops keep full access) and an initial 'start' event so the billing
-- history has an anchor. Adjust the plan per shop afterwards if needed:
--   UPDATE dc_pos.subscription SET plan = 'pro' WHERE id = 1;
INSERT INTO dc_pos.subscription (id, plan, status, billing_method)
VALUES (1, 'privilege', 'active', 'invoice')
ON CONFLICT (id) DO NOTHING;

INSERT INTO dc_pos.subscription_events (event_type, plan)
SELECT 'start', s.plan FROM dc_pos.subscription s
WHERE s.id = 1 AND NOT EXISTS (SELECT 1 FROM dc_pos.subscription_events);
