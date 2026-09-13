#!/usr/bin/env bash
# ============================================================
# Reset the "demo" shop database (demo.tradiz.fr) to a fresh
# state: wipes tester data, then re-applies seed-demo-data.sql.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:port ./scripts/reset-demo.sh
#
# If DATABASE_URL is not set, falls back to the psql default
# (local socket / peer auth) on database `demo`.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

build_demo_url() {
    local url="$1"
    local base query
    if [[ "$url" == *"?"* ]]; then
        base="${url%%\?*}"
        query="?${url#*\?}"
    else
        base="$url"
        query=""
    fi
    echo "${base%/}/demo${query}"
}

if [ -z "${DATABASE_URL:-}" ]; then
    echo "⚠️  DATABASE_URL not set — using psql default connection."
    DEMO_PSQL=(psql -d demo)
else
    DEMO_PSQL=(psql "$(build_demo_url "$DATABASE_URL")")
fi

echo "▶ Step 1/2: Wiping demo data…"
"${DEMO_PSQL[@]}" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/reset-demo.sql" > /dev/null

echo "▶ Step 2/2: Re-seeding demo data…"
"${DEMO_PSQL[@]}" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/seed-demo-data.sql" > /dev/null

echo "✅ Demo reset complete — fresh data ready."
