#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# migrate-postgres-host.sh — copy Tradiz databases between Postgres hosts
#
# Use cases:
#   • Neon free tier nearly saturated → move DBs to Supabase (or another host)
#   • Split shops into separate Neon projects so each gets its own free quota
#
# The app routes by database name (shopId), so each shop stays a separate
# database on the target — same topology as today.
#
# IMPORTANT for Supabase: use the DIRECT connection host (db.<ref>.supabase.co,
# port 5432) or the session-mode pooler — NEVER the transaction pooler
# (port 6543). The app relies on session-scoped pg_advisory_lock and
# SET search_path, which transaction pooling does not preserve.
#
# Usage:
#   export SOURCE_HOST=ep-xxx.neon.tech SOURCE_USER=... SOURCE_PASSWORD=...
#   export TARGET_HOST=db.<ref>.supabase.co TARGET_USER=postgres TARGET_PASSWORD=...
#   ./scripts/migrate-postgres-host.sh annette gds demo
#
# Optional env:
#   TARGET_ADMIN_DB   admin database on target used to CREATE DATABASE
#                     (default: postgres)
#   DBS               space-separated list if you prefer env over args
#   DUMP_DIR          where dumps are written (default: ./pg-migration-dumps)
#   SKIP_VERIFY=1     skip post-restore row-count comparison
#
# Safety:
#   • Refuses to restore into a database that already contains tables.
#   • Dumps are kept in DUMP_DIR — they double as the pre-migration backup.
#   • Writes made on the SOURCE after a dump starts are NOT carried over:
#     run this during closing hours / a write-freeze window per shop.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

: "${SOURCE_HOST:?set SOURCE_HOST}" "${SOURCE_USER:?set SOURCE_USER}" "${SOURCE_PASSWORD:?set SOURCE_PASSWORD}"
: "${TARGET_HOST:?set TARGET_HOST}" "${TARGET_USER:?set TARGET_USER}" "${TARGET_PASSWORD:?set TARGET_PASSWORD}"

TARGET_ADMIN_DB="${TARGET_ADMIN_DB:-postgres}"
DUMP_DIR="${DUMP_DIR:-./pg-migration-dumps}"
DBS=("$@")
if [ "${#DBS[@]}" -eq 0 ] && [ -n "${DBS_ENV:-}" ]; then read -r -a DBS <<<"$DBS_ENV"; fi
if [ "${#DBS[@]}" -eq 0 ]; then
    echo "usage: $0 <db> [db...]   (e.g. $0 annette gds demo)" >&2
    exit 1
fi

mkdir -p "$DUMP_DIR"

SSL="sslmode=verify-full sslrootcert=system"
tgt() { local db=$1; shift; PGPASSWORD="$TARGET_PASSWORD" psql "host=$TARGET_HOST user=$TARGET_USER dbname=$db $SSL" "$@"; }

COUNTS_SQL="SELECT n.nspname||'.'||c.relname||'='||c.reltuples::bigint
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE c.relkind='r' AND n.nspname LIKE 'dc%' ORDER BY 1"

echo "==> Source sizes"
for db in "${DBS[@]}"; do
    size=$(PGPASSWORD="$SOURCE_PASSWORD" psql "host=$SOURCE_HOST user=$SOURCE_USER dbname=$db $SSL" -t -A \
        -c "SELECT pg_size_pretty(pg_database_size('$db'))")
    printf '    %-10s %s\n' "$db" "$size"
done

for db in "${DBS[@]}"; do
    echo
    echo "=== $db ==="

    # 1. Create the target database if missing (connecting to the admin DB).
    exists=$(tgt "$TARGET_ADMIN_DB" -t -A -c "SELECT 1 FROM pg_database WHERE datname='$db'")
    if [ -z "$exists" ]; then
        echo "--> creating database $db on target"
        tgt "$TARGET_ADMIN_DB" -c "CREATE DATABASE \"$db\""
    fi

    # 2. Refuse to restore over a non-empty database.
    tables=$(tgt "$db" -t -A -c \
        "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema','pg_toast')")
    if [ "${tables:-0}" != "0" ]; then
        echo "!!  target database '$db' already has $tables tables — skipping (refusing to clobber)" >&2
        echo "    drop it first if you really want to overwrite: tgt $db -c 'DROP SCHEMA dc CASCADE; DROP SCHEMA dc_pos CASCADE; DROP SCHEMA dc_sys CASCADE'" >&2
        continue
    fi

    # 3. Dump (custom format, no owner/privileges — roles differ across hosts).
    dump="$DUMP_DIR/$db-$(date +%Y%m%d-%H%M%S).dump"
    echo "--> dumping $db → $dump"
    PGPASSWORD="$SOURCE_PASSWORD" pg_dump \
        "host=$SOURCE_HOST user=$SOURCE_USER dbname=$db $SSL" \
        --format=custom --no-owner --no-privileges --file="$dump"

    # 4. Restore.
    echo "--> restoring into $db on $TARGET_HOST"
    PGPASSWORD="$TARGET_PASSWORD" pg_restore \
        --dbname="host=$TARGET_HOST user=$TARGET_USER dbname=$db $SSL" \
        --no-owner --no-privileges --exit-on-error \
        "$dump"

    # 5. Verify: row counts per table must match source.
    if [ "${SKIP_VERIFY:-}" != "1" ]; then
        echo "--> verifying row counts"
        src_counts=$(PGPASSWORD="$SOURCE_PASSWORD" psql "host=$SOURCE_HOST user=$SOURCE_USER dbname=$db $SSL" -t -A -c "$COUNTS_SQL")
        tgt_counts=$(tgt "$db" -t -A -c "$COUNTS_SQL")
        if [ "$src_counts" != "$tgt_counts" ]; then
            echo "!!  row-count mismatch for $db:" >&2
            diff <(echo "$src_counts") <(echo "$tgt_counts") >&2 || true
            echo "    (reltuples is an estimate — run ANALYZE on both sides and re-check," >&2
            echo "     or verify critical tables with exact count(*))" >&2
        else
            echo "    OK — counts match"
        fi
    fi
done

echo
echo "==> Done. Next steps:"
echo "    1. Point the app at the target: PG_HOST=$TARGET_HOST PG_USER=$TARGET_USER PG_PASSWORD=***"
echo "       (keep dbname = shopId routing — databases were created with the same names)"
echo "    2. Run schema verification: bun scripts/verify-schema.ts (against the target)"
echo "    3. Smoke-test a sale: bun run test:smoke"
echo "    4. Keep the SOURCE running read-only for a few days as rollback insurance."
