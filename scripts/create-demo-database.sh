#!/usr/bin/env bash
# ============================================================
# Create the "demo" shop database (demo.tradiz.fr)
#
# This script:
#   1. Creates the `demo` PostgreSQL database
#   2. Applies the full schema (reuses create-postgres-database.sql,
#      skipping the `CREATE DATABASE gds` / `\c gds` lines)
#   3. Seeds demo data (parameters, users, categories, products…)
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:port ./scripts/create-demo-database.sh
#
# If DATABASE_URL is not set, falls back to the psql default
# (local socket / peer auth).
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_SQL="$SCRIPT_DIR/create-postgres-database.sql"
SEED_SQL="$SCRIPT_DIR/seed-demo-data.sql"

# Build a connection string for the `demo` database from DATABASE_URL.
# Handles query strings (e.g. ?sslmode=require) correctly.
build_demo_url() {
    local url="$1"
    # Split on the first '?' to separate the base URL from query params.
    local base query
    if [[ "$url" == *"?"* ]]; then
        base="${url%%\?*}"
        query="?${url#*\?}"
    else
        base="$url"
        query=""
    fi
    # Strip trailing slash from base, then append /demo + query.
    echo "${base%/}/demo${query}"
}

if [ -z "${DATABASE_URL:-}" ]; then
    echo "⚠️  DATABASE_URL not set — using psql default connection."
    ADMIN_PSQL=(psql)
    DEMO_PSQL=(psql -d demo)
else
    ADMIN_PSQL=(psql "$DATABASE_URL")
    DEMO_PSQL=(psql "$(build_demo_url "$DATABASE_URL")")
fi

echo "▶ Step 1/3: Creating demo database (if not exists)…"
"${ADMIN_PSQL[@]}" -c "CREATE DATABASE demo;" 2>/dev/null || {
    echo "  demo database already exists, continuing."
}

echo "▶ Step 2/3: Applying schema…"
# The schema file creates dc.categories (STEP 3) before dc_pos.companies/printers
# (STEP 4), but dc.categories has FKs to those tables. Create the prerequisite
# dc_pos tables first so the FKs resolve, then run the full schema (which will
# skip them via IF NOT EXISTS).
"${DEMO_PSQL[@]}" -v ON_ERROR_STOP=1 > /dev/null 2>&1 <<'PREREQ'
CREATE SCHEMA IF NOT EXISTS dc;
CREATE SCHEMA IF NOT EXISTS dc_pos;
CREATE SCHEMA IF NOT EXISTS dc_sys;
CREATE TABLE IF NOT EXISTS dc_pos.companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    employer_share DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    siret VARCHAR(14) DEFAULT NULL,
    vat_number VARCHAR(50) DEFAULT NULL,
    address VARCHAR(255) DEFAULT NULL,
    zip_code VARCHAR(10) DEFAULT NULL,
    city VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dc_pos.printers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ip_address VARCHAR(50) DEFAULT NULL
);
PREREQ
# The schema file starts with `CREATE DATABASE gds; \c gds;` (lines 1-19).
# We skip those lines and pipe the rest into the demo database.
tail -n +20 "$SCHEMA_SQL" | "${DEMO_PSQL[@]}" -v ON_ERROR_STOP=1 > /dev/null
echo "  Schema applied."

echo "▶ Step 3/3: Seeding demo data…"
"${DEMO_PSQL[@]}" -v ON_ERROR_STOP=1 -f "$SEED_SQL" > /dev/null
echo "  Demo data seeded."

echo ""
echo "✅ demo database created successfully."
echo "   The shop is now visible at https://demo.tradiz.fr"
