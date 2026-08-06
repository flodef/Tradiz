#!/usr/bin/env bash
# ============================================================
# import-gds.sh — Interactive GDS data import script
#
# Merges and imports:
#   - Static data from import-gds-data.sql (companies, customers, products, formulas)
#   - Live DB data exported at runtime (parameters, payment_methods, devices,
#     printers, users, theme_admin, theme_client)
#
# Usage: bash scripts/import-gds.sh
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATIC_SQL="$SCRIPT_DIR/import-gds-data.sql"
TEMP_SQL="$(mktemp --suffix=.sql)"
trap 'rm -f "$TEMP_SQL"' EXIT

# ------------------------------------------------------------
# Colors
# ------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ------------------------------------------------------------
# Prompt helpers (default = first option shown)
# ------------------------------------------------------------
prompt_yes_no() {
    local question="$1" default="${2:-yes}" response
    local hint
    if [[ "$default" == "yes" ]]; then
        hint="[Y/n]"
    else
        hint="[y/N]"
    fi
    echo -ne "${BOLD}${question}${NC} ${hint} "
    read -r response
    response="${response:-$default}"
    case "$response" in
        [Yy]*) return 0 ;;
        *)     return 1 ;;
    esac
}

prompt_input() {
    local question="$1" default="${2:-}" response
    echo -ne "${BOLD}${question}${NC}"
    [[ -n "$default" ]] && echo -ne " (${default})"
    echo -ne " "
    read -r response
    echo "${response:-$default}"
}

# ------------------------------------------------------------
# Interactive prompts
# ------------------------------------------------------------
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   GDS Data Import — Interactive Wizard   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# 1. Dry-run
DRY_RUN=yes
if prompt_yes_no "Run in dry-run mode? (rollback at the end)" "yes"; then
    DRY_RUN=yes
    info "Dry-run mode: changes will be rolled back."
else
    DRY_RUN=no
    warn "Real mode: changes will be committed."
fi
echo ""

# 2. Delete existing data
DELETE_DATA=no
if prompt_yes_no "Delete existing imported data before insert?" "no"; then
    DELETE_DATA=yes
    warn "Existing data in target tables will be DELETEd."
else
    DELETE_DATA=no
    info "Existing data will be kept (ON CONFLICT DO NOTHING / WHERE NOT EXISTS)."
fi
echo ""

# 3. Connection
USE_CURRENT=yes
CONN_STR=""
if prompt_yes_no "Use the current .env.local connection?" "yes"; then
    USE_CURRENT=yes
    if [[ ! -f "$PROJECT_DIR/.env.local" ]]; then
        error ".env.local not found at $PROJECT_DIR/.env.local"
        exit 1
    fi
    # shellcheck disable=SC1091
    set -a; source "$PROJECT_DIR/.env.local"; set +a
    DB_NAME="${NEXT_PUBLIC_SHOP_ID:-gds}"
    CONN_STR="host=${PG_HOST} user=${PG_USER} password=${PG_PASSWORD} dbname=${DB_NAME} sslmode=require"
    info "Using connection: host=${PG_HOST} dbname=${DB_NAME}"
else
    USE_CURRENT=no
    PG_HOST_INPUT=$(prompt_input "PG host?" "")
    PG_USER_INPUT=$(prompt_input "PG user?" "")
    PG_PASSWORD_INPUT=$(prompt_input "PG password?" "")
    DB_NAME_INPUT=$(prompt_input "Database name?" "gds")
    CONN_STR="host=${PG_HOST_INPUT} user=${PG_USER_INPUT} password=${PG_PASSWORD_INPUT} dbname=${DB_NAME_INPUT} sslmode=require"
    info "Using custom connection: host=${PG_HOST_INPUT} dbname=${DB_NAME_INPUT}"
fi
echo ""

# ------------------------------------------------------------
# Verify connection
# ------------------------------------------------------------
info "Testing database connection..."
if ! psql "$CONN_STR" -c "SELECT 1;" >/dev/null 2>&1; then
    error "Cannot connect to the database. Check your credentials."
    exit 1
fi
ok "Connection successful."
echo ""

# ------------------------------------------------------------
# Export live DB data as INSERT statements
# ------------------------------------------------------------
info "Exporting live data from database (parameters, payment_methods, devices, printers, users, themes)..."

# Helper: generate INSERT statements for a table using a SQL query
# We use row_to_json + jsonb_each_text is too complex; instead we build INSERTs
# with a dedicated SQL query per table that handles proper escaping.
generate_inserts() {
    local conn_str="$1"
    psql "$conn_str" -t -A -v ON_ERROR_STOP=1 <<'SQL'
-- Generate INSERT statements for live DB data
-- We use a PL/pgSQL block to build properly escaped INSERT statements

DO $$
DECLARE
    r RECORD;
    sql text;
    val text;
BEGIN
    -- ===== dc_pos.users =====
    FOR r IN SELECT * FROM dc_pos.users ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc_pos.users (id, name, role, reference, created_at) VALUES (%s, %L, %L, %L, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.name, r.role, r.reference, r.created_at
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc_pos.parameters =====
    FOR r IN SELECT * FROM dc_pos.parameters ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc_pos.parameters (id, param_key, param_value, updated_at) VALUES (%s, %L, %L, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.param_key, r.param_value, r.updated_at
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc_pos.payment_methods =====
    FOR r IN SELECT * FROM dc_pos.payment_methods ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc_pos.payment_methods (id, label, address, currency, hidden, created_at) VALUES (%s, %L, %L, %L, %s, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.label, r.address, r.currency, r.hidden, r.created_at
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc_pos.printers =====
    FOR r IN SELECT * FROM dc_pos.printers ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc_pos.printers (id, name, ip_address) VALUES (%s, %L, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.name, r.ip_address
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc_pos.devices =====
    FOR r IN SELECT * FROM dc_pos.devices ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc_pos.devices (id, label, public_key, user_id, connected, last_seen, created_at) VALUES (%s, %L, %L, %s, %s, %L, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.label, r.public_key,
            COALESCE(r.user_id::text, 'NULL'),
            r.connected,
            r.last_seen, r.created_at
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc.theme_admin =====
    FOR r IN SELECT * FROM dc.theme_admin ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc.theme_admin (id, selected, name, text_light, text_dark, gradient_start_light, gradient_start_dark, gradient_end_light, gradient_end_dark, popup_light, popup_dark, activated_light, activated_dark, secondary_light, secondary_dark, secondary_activated_light, secondary_activated_dark) VALUES (%s, %s, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.selected, r.name,
            r.text_light, r.text_dark,
            r.gradient_start_light, r.gradient_start_dark,
            r.gradient_end_light, r.gradient_end_dark,
            r.popup_light, r.popup_dark,
            r.activated_light, r.activated_dark,
            r.secondary_light, r.secondary_dark,
            r.secondary_activated_light, r.secondary_activated_dark
        );
        RAISE NOTICE '%', sql;
    END LOOP;

    -- ===== dc.theme_client =====
    FOR r IN SELECT * FROM dc.theme_client ORDER BY id LOOP
        sql := format(
            'INSERT INTO dc.theme_client (id, name, primary_text, secondary_text, background, border, error, success, warning, is_active, theme_type) VALUES (%s, %L, %L, %L, %L, %L, %L, %L, %L, %s, %L) ON CONFLICT (id) DO NOTHING;',
            r.id, r.name,
            r.primary_text, r.secondary_text,
            r.background, r.border,
            r.error, r.success, r.warning,
            r.is_active, r.theme_type
        );
        RAISE NOTICE '%', sql;
    END LOOP;
END $$;
SQL
}

# Export live data
# RAISE NOTICE outputs "NOTICE: INSERT INTO..." — strip the "NOTICE: " prefix
LIVE_SQL="$(generate_inserts "$CONN_STR" 2>&1 | sed 's/^NOTICE: //' | grep '^INSERT INTO')"
if [[ -z "$LIVE_SQL" ]]; then
    error "Failed to export live data from database (no INSERT statements generated)."
    generate_inserts "$CONN_STR" 2>&1 | sed 's/^NOTICE: //'
    exit 1
fi
LIVE_COUNT=$(echo "$LIVE_SQL" | grep -c "INSERT INTO" || true)
ok "Exported $LIVE_COUNT live INSERT statements."
echo ""

# ------------------------------------------------------------
# Build the final SQL script
# ------------------------------------------------------------
info "Building final SQL script..."

{
    echo "-- ============================================================"
    echo "-- GDS Data Import Script (generated $(date -u '+%Y-%m-%d %H:%M:%S UTC'))"
    echo "-- Mode: $([ "$DRY_RUN" == "yes" ] && echo 'DRY-RUN (rollback)' || echo 'REAL (commit)')"
    echo "-- Delete existing: $([ "$DELETE_DATA" == "yes" ] && echo 'YES' || echo 'NO')"
    echo "-- ============================================================"
    echo ""
    echo "BEGIN;"
    echo ""

    # --- Optional: Delete existing data ---
    if [[ "$DELETE_DATA" == "yes" ]]; then
        echo "-- ============================================================"
        echo "-- Delete existing data"
        echo "-- ============================================================"
        echo "-- Order matters: respect foreign key constraints"
        echo "DELETE FROM dc_pos.balance_history;"
        echo "DELETE FROM dc_pos.devices;"
        echo "DELETE FROM dc_pos.customers;"
        echo "DELETE FROM dc_pos.companies;"
        echo "DELETE FROM dc_pos.users;"
        echo "DELETE FROM dc_pos.parameters;"
        echo "DELETE FROM dc_pos.payment_methods;"
        echo "DELETE FROM dc_pos.printers;"
        echo "DELETE FROM dc_pos.discounts;"
        echo "DELETE FROM dc_pos.currencies;"
        echo "DELETE FROM dc.theme_admin;"
        echo "DELETE FROM dc.theme_client;"
        echo "DELETE FROM dc.rel_order_formula_element;"
        echo "DELETE FROM dc.rel_order_formula;"
        echo "DELETE FROM dc.rel_order_product;"
        echo "DELETE FROM dc.orders;"
        echo "DELETE FROM dc.rel_formula_element_product;"
        echo "DELETE FROM dc.rel_formula_element_formula;"
        echo "DELETE FROM dc.formula_elements;"
        echo "DELETE FROM dc.formulas;"
        echo "DELETE FROM dc.rel_table_order;"
        echo "DELETE FROM dc.tables;"
        echo "DELETE FROM dc.walls;"
        echo "DELETE FROM dc.products;"
        echo "DELETE FROM dc.establishment_config;"
        echo "-- Reset sequences after delete"
        echo "SELECT setval('dc_pos.users_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.users), 1), true);"
        echo "SELECT setval('dc_pos.parameters_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.parameters), 1), true);"
        echo "SELECT setval('dc_pos.payment_methods_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.payment_methods), 1), true);"
        echo "SELECT setval('dc_pos.printers_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.printers), 1), true);"
        echo "SELECT setval('dc_pos.devices_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.devices), 1), true);"
        echo "SELECT setval('dc_pos.customers_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.customers), 1), true);"
        echo "SELECT setval('dc_pos.companies_id_seq', COALESCE((SELECT MAX(id) FROM dc_pos.companies), 1), true);"
        echo "SELECT setval('dc.products_id_seq', COALESCE((SELECT MAX(id) FROM dc.products), 1), true);"
        echo "SELECT setval('dc.formulas_id_seq', COALESCE((SELECT MAX(id) FROM dc.formulas), 1), true);"
        echo "SELECT setval('dc.theme_admin_id_seq', COALESCE((SELECT MAX(id) FROM dc.theme_admin), 1), true);"
        echo "SELECT setval('dc.theme_client_id_seq', COALESCE((SELECT MAX(id) FROM dc.theme_client), 1), true);"
        echo ""
    fi

    # --- Live DB data (users first, then devices reference users) ---
    echo "-- ============================================================"
    echo "-- Live DB data (exported from current database)"
    echo "-- ============================================================"
    echo "$LIVE_SQL"
    echo ""

    # --- Static import data (companies, customers, products, formulas) ---
    echo "-- ============================================================"
    echo "-- Static import data (from POS exports)"
    echo "-- ============================================================"
    # Skip the header and BEGIN/COMMIT from the static file
    sed -n '/^-- Ensure unique constraint/,/^COMMIT;/p' "$STATIC_SQL" | sed 's/^COMMIT;$//'
    echo ""

    # --- Commit or Rollback ---
    if [[ "$DRY_RUN" == "yes" ]]; then
        echo "-- Dry-run: rolling back all changes"
        echo "ROLLBACK;"
    else
        echo "COMMIT;"
    fi
    echo ""

    # --- Summary ---
    echo "-- ============================================================"
    echo "-- Import summary:"
    echo "--   Live DB inserts:  $LIVE_COUNT"
    echo "--   Mode:             $([ "$DRY_RUN" == "yes" ] && echo 'DRY-RUN (rolled back)' || echo 'REAL (committed)')"
    echo "--   Delete existing:  $([ "$DELETE_DATA" == "yes" ] && echo 'YES' || echo 'NO')"
    echo "-- ============================================================"

} > "$TEMP_SQL"

ok "Final SQL script built: $TEMP_SQL ($(wc -l < "$TEMP_SQL") lines)"
echo ""

# ------------------------------------------------------------
# Execute
# ------------------------------------------------------------
info "Executing SQL script..."
echo ""

if psql "$CONN_STR" -v ON_ERROR_STOP=1 -f "$TEMP_SQL" 2>&1 | tee /tmp/import-gds-output.log; then
    echo ""
    if [[ "$DRY_RUN" == "yes" ]]; then
        ok "Dry-run completed successfully. All changes rolled back."
        info "To apply for real, re-run this script and choose 'no' for dry-run."
    else
        ok "Import completed successfully. Changes committed."
    fi

    # Show row counts
    echo ""
    info "Current row counts:"
    psql "$CONN_STR" -c "
    SELECT 'companies' as table_name, count(*) FROM dc_pos.companies
    UNION ALL SELECT 'customers', count(*) FROM dc_pos.customers
    UNION ALL SELECT 'products', count(*) FROM dc.products
    UNION ALL SELECT 'formulas', count(*) FROM dc.formulas
    UNION ALL SELECT 'users', count(*) FROM dc_pos.users
    UNION ALL SELECT 'parameters', count(*) FROM dc_pos.parameters
    UNION ALL SELECT 'payment_methods', count(*) FROM dc_pos.payment_methods
    UNION ALL SELECT 'devices', count(*) FROM dc_pos.devices
    UNION ALL SELECT 'printers', count(*) FROM dc_pos.printers
    UNION ALL SELECT 'theme_admin', count(*) FROM dc.theme_admin
    UNION ALL SELECT 'theme_client', count(*) FROM dc.theme_client
    ORDER BY 1;
    "
else
    error "SQL execution failed. Check /tmp/import-gds-output.log for details."
    exit 1
fi
