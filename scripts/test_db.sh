#!/usr/bin/env bash
# Apply every migration to a throwaway local Postgres and run the SQL tests.
# Never touches Supabase.
#
#   bash scripts/test_db.sh                  # spins up a temporary cluster (needs initdb/pg_ctl on PATH or in /usr/lib/postgresql/*/bin)
#   DATABASE_URL=postgres://... bash scripts/test_db.sh   # use an existing EMPTY database (CI)
set -euo pipefail
cd "$(dirname "$0")/.."

PSQL_OPTS=(-v ON_ERROR_STOP=1 -q -X)
cleanup() { :; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  PGBIN="$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb | tail -1)")"
  TMP="$(mktemp -d)"
  RUN_AS=()
  if [[ "$(id -u)" == "0" ]]; then
    id -u postgres >/dev/null 2>&1 || useradd -M postgres
    chown -R postgres "$TMP"; RUN_AS=(su postgres -c)
  fi
  run() { if [[ ${#RUN_AS[@]} -gt 0 ]]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
  run "$PGBIN/initdb -D $TMP/data -A trust -U postgres >/dev/null"
  run "$PGBIN/pg_ctl -D $TMP/data -o '-k $TMP -p 54329 -c listen_addresses=' -l $TMP/log -w start >/dev/null"
  cleanup() { run "$PGBIN/pg_ctl -D $TMP/data -m immediate stop >/dev/null" || true; rm -rf "$TMP"; }
  trap cleanup EXIT
  DATABASE_URL="postgresql://postgres@/postgres?host=$TMP&port=54329"
fi

echo "→ stub"
psql "$DATABASE_URL" "${PSQL_OPTS[@]}" -f supabase/tests/00_supabase_stub.sql

for f in supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  psql "$DATABASE_URL" "${PSQL_OPTS[@]}" -f "$f"
done

for f in supabase/tests/[0-9][0-9][0-9]_*.test.sql; do
  echo "→ test $(basename "$f")"
  psql "$DATABASE_URL" "${PSQL_OPTS[@]}" -t -f "$f"
done
echo "✓ database tests passed"
