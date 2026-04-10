#!/usr/bin/env bash
# Exporta o banco do Docker para Dumps/ na raiz do repositório.
# Uso: ./backend/scripts/dump-db.sh [full|data|sql]
set -euo pipefail

MODE="${1:-full}"
CONTAINER="${CONTAINER:-flightsearch_db}"
DB="${DB:-flights}"
PGUSER="${PGUSER:-postgres}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DUMPS="$ROOT/Dumps"
mkdir -p "$DUMPS"

if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]]; then
  echo "Container $CONTAINER não está rodando. Rode: docker compose up -d" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"

case "$MODE" in
  full)
    OUT="$DUMPS/flights-$STAMP.dump"
    docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$DB" -Fc --no-owner --no-acl -f /tmp/flights.dump
    docker cp "$CONTAINER:/tmp/flights.dump" "$OUT"
    docker exec "$CONTAINER" rm -f /tmp/flights.dump
    echo "Dump custom criado: $OUT"
    ;;
  data)
    OUT="$DUMPS/flights-data-$STAMP.sql"
    docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$DB" --data-only --no-owner --no-acl -f /tmp/data.sql
    docker cp "$CONTAINER:/tmp/data.sql" "$OUT"
    docker exec "$CONTAINER" rm -f /tmp/data.sql
    echo "Dump só dados: $OUT"
    ;;
  sql)
    OUT="$DUMPS/flights-full-$STAMP.sql"
    docker exec "$CONTAINER" pg_dump -U "$PGUSER" -d "$DB" -Fp --no-owner --no-acl -f /tmp/full.sql
    docker cp "$CONTAINER:/tmp/full.sql" "$OUT"
    docker exec "$CONTAINER" rm -f /tmp/full.sql
    echo "Dump SQL completo: $OUT"
    ;;
  *)
    echo "Uso: $0 [full|data|sql]" >&2
    exit 1
    ;;
esac
