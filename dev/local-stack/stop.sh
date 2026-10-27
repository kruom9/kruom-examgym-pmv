#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$HERE/../.." && pwd)"; LOCAL="$REPO/.local"
TOOLS="${EXAMGYM_TOOLS:-/workspace/kruom/_tools}"
PGBIN="${PGBIN:-$TOOLS/pgnpm/node_modules/@embedded-postgres/linux-x64/native/bin}"
for p in gateway postgrest auth; do [ -f "$LOCAL/$p.pid" ] && kill "$(cat "$LOCAL/$p.pid")" 2>/dev/null; rm -f "$LOCAL/$p.pid"; done
[ -d "$LOCAL/pgdata" ] && "$PGBIN/pg_ctl" -D "$LOCAL/pgdata" -m fast stop >/dev/null 2>&1
echo stopped
