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
    # Prompt goes to stderr so it's not captured by $(...) command substitution
    echo -ne "${BOLD}${question}${NC}" >&2
    [[ -n "$default" ]] && echo -ne " (${default})" >&2
    echo -ne " " >&2
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

# 3. Connection — always load .env.local for user/password, only host may differ
if [[ ! -f "$PROJECT_DIR/.env.local" ]]; then
    error ".env.local not found at $PROJECT_DIR/.env.local"
    exit 1
fi
# shellcheck disable=SC1091
set -a; source "$PROJECT_DIR/.env.local"; set +a
DB_NAME="${NEXT_PUBLIC_SHOP_ID:-gds}"

USE_CURRENT=yes
CONN_STR=""
if prompt_yes_no "Use the current .env.local connection?" "yes"; then
    CONN_STR="host=${PG_HOST} user=${PG_USER} password=${PG_PASSWORD} dbname=${DB_NAME} sslmode=require"
    info "Using connection: host=${PG_HOST} dbname=${DB_NAME}"
else
    USE_CURRENT=no
    echo ""
    echo -e "  Paste the connection string (host only, user/password from .env.local)."
    echo -e "  You can paste either:"
    echo -e "    • A .env line like:  ${CYAN}PG_HOST=ep-xxx.neon.tech${NC}"
    echo -e "    • Or a bare host:     ${CYAN}ep-xxx.neon.tech${NC}"
    echo -e "  (anything after # is ignored)"
    echo ""
    HOST_INPUT=$(prompt_input "Connection string" "")
    # Strip "PG_HOST=" prefix if present, then strip comments (#...), trim whitespace
    HOST_INPUT="${HOST_INPUT#PG_HOST=}"
    HOST_INPUT="${HOST_INPUT%%#*}"
    HOST_INPUT="$(echo "$HOST_INPUT" | xargs)"

    if [[ -z "$HOST_INPUT" ]]; then
        error "No connection string provided."
        exit 1
    fi

    CONN_STR="host=${HOST_INPUT} user=${PG_USER} password=${PG_PASSWORD} dbname=${DB_NAME} sslmode=require"
    info "Using connection: host=${HOST_INPUT} dbname=${DB_NAME}"
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

    # --- Static import data (live DB data + POS exports, all in import-gds-data.sql) ---
    echo "-- ============================================================"
    echo "-- Import data (live DB data + POS exports)"
    echo "-- ============================================================"
    # Include everything from the DO $$ block to just before COMMIT
    sed -n '/^-- Ensure unique constraint/,/^COMMIT;/{/^COMMIT;/d;p}' "$STATIC_SQL"
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
