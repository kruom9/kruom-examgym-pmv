#!/usr/bin/env bash
# Local ExamGym stack WITHOUT Docker (Docker is not available on this box, so `supabase start` cannot run).
#   Postgres 17 (embedded binaries) :54322   — same port as `supabase start`
#   Supabase Auth (GoTrue v2.197)   :9999    — the real auth server, anonymous sign-ins enabled
#   PostgREST v16.5                 :54331   — the real REST server Supabase uses
#   gateway.mjs                     :54321   — Kong stand-in (/auth/v1, /rest/v1, apikey check, CORS)
#   static apps                     :8080
# Applies supabase/migrations/*.sql then supabase/seed.sql in order, exactly like `supabase db reset`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"
TOOLS="${EXAMGYM_TOOLS:-/workspace/kruom/_tools}"
PGBIN="${PGBIN:-$TOOLS/pgnpm/node_modules/@embedded-postgres/linux-x64/native/bin}"
AUTHDIR="${AUTHDIR:-$TOOLS/auth}"; PGRST="${PGRST:-$TOOLS/bin/postgrest}"
LOCAL="$REPO/.local"; DATA="$LOCAL/pgdata"; LOG="$LOCAL/logs"; mkdir -p "$LOG"
JWT_SECRET="local-dev-only-jwt-secret-at-least-32-characters-long"
eval "$(node "$HERE/mkjwt.mjs" "$JWT_SECRET")"
printf 'SUPABASE_URL=http://127.0.0.1:54321\nANON_KEY=%s\nSERVICE_ROLE_KEY=%s\nJWT_SECRET=%s\nDB_URL=postgresql://postgres@127.0.0.1:54322/postgres\n' "$ANON_KEY" "$SERVICE_ROLE_KEY" "$JWT_SECRET" > "$LOCAL/keys.env"
DB="postgresql://postgres@127.0.0.1:54322/postgres"

"$HERE/stop.sh" >/dev/null 2>&1 || true
rm -rf "$DATA"
"$PGBIN/initdb" -D "$DATA" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >"$LOG/initdb.log"
"$PGBIN/pg_ctl" -D "$DATA" -o "-p 54322 -k /tmp -c listen_addresses=127.0.0.1" -l "$LOG/postgres.log" -w start >/dev/null
python3 "$HERE/apply_sql.py" "$DB" "$HERE/bootstrap.sql"

# Supabase Auth: run its own migrations, then serve
export GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgresql://supabase_auth_admin:local-dev-only@127.0.0.1:54322/postgres?search_path=auth"
export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 GOTRUE_SITE_URL=http://127.0.0.1:8080 GOTRUE_URI_ALLOW_LIST="http://127.0.0.1:8080,http://localhost:8080"
export GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED=true
export GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_PASSWORD_MIN_LENGTH=8
export GOTRUE_RATE_LIMIT_ANONYMOUS_USERS=300 GOTRUE_LOG_LEVEL=info GOTRUE_DB_MIGRATIONS_PATH="$AUTHDIR/migrations"
( cd "$AUTHDIR" && ./auth migrate >"$LOG/auth-migrate.log" 2>&1 )
( cd "$AUTHDIR" && nohup ./auth serve >"$LOG/auth.log" 2>&1 & echo $! > "$LOCAL/auth.pid" )

# our project: migrations then seed (same order as `supabase db reset`)
python3 "$HERE/apply_sql.py" "$DB" "$REPO"/supabase/migrations/*.sql "$REPO/supabase/seed.sql"

# PostgREST (authenticator → anon/authenticated by JWT role claim)
export PGRST_DB_URI="postgresql://authenticator:local-dev-only@127.0.0.1:54322/postgres" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon
export PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=54331 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_EXTRA_SEARCH_PATH=extensions
nohup "$PGRST" >"$LOG/postgrest.log" 2>&1 & echo $! > "$LOCAL/postgrest.pid"

SB_API_KEYS="$ANON_KEY,$SERVICE_ROLE_KEY" nohup node "$HERE/gateway.mjs" "$REPO/apps" >"$LOG/gateway.log" 2>&1 & echo $! > "$LOCAL/gateway.pid"

# app config for the local test (git-ignored)
printf 'window.EXAMGYM_CONFIG = {\n  SUPABASE_URL: "http://127.0.0.1:54321",\n  SUPABASE_ANON_KEY: "%s",\n  M6_URL: "https://kruom9.github.io/kruom-cefr/examgym/m6-ios/"\n};\n' "$ANON_KEY" > "$REPO/apps/web/config.js"
for i in $(seq 1 40); do curl -sf http://127.0.0.1:54321/auth/v1/health -H "apikey: $ANON_KEY" >/dev/null && curl -sf "http://127.0.0.1:54321/rest/v1/grades?select=code" -H "apikey: $ANON_KEY" >/dev/null && break; sleep 0.5; done
echo "ExamGym local stack up: API http://127.0.0.1:54321  apps http://127.0.0.1:8080/web/  keys in .local/keys.env"
