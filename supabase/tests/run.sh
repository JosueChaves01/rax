#!/usr/bin/env bash
# Aplica stubs + migraciones a una base Postgres vacía y corre las pruebas de RLS.
# Uso: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
DB="${RAX_TEST_DB:-rax_test}"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_local_stubs.sql
for f in supabase/migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/01_rls.sql 2>&1 | grep -E "NOTICE|ERROR|FALLO" | sed 's/^.*NOTICE:  //'
echo "RLS: todas las comprobaciones pasaron"
