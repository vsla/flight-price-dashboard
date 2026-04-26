#!/usr/bin/env bash
# Dump do banco local e restore na VM em um comando
# Pré-requisito: Docker rodando com o container local
set -euo pipefail
source "$(dirname "$0")/config.sh"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMPS="$ROOT/Dumps"
mkdir -p "$DUMPS"
DUMP_FILE="$DUMPS/sync-$(date +%Y%m%dT%H%M%S).dump"

echo "==> Gerando dump do banco local..."
docker exec "$LOCAL_CONTAINER" pg_dump \
  -U "$LOCAL_PGUSER" -d "$LOCAL_DB" \
  -Fc --no-owner --no-acl \
  -f /tmp/sync.dump
docker cp "$LOCAL_CONTAINER:/tmp/sync.dump" "$DUMP_FILE"
echo "    Dump salvo em: $DUMP_FILE"

echo "==> Abrindo tunnel SSH (porta 5433)..."
ssh -i "$KEY" -L 5433:localhost:5432 $VM_USER@$VM_HOST -N -f -o ExitOnForwardFailure=yes
TUNNEL_PID=$!
sleep 2

echo "==> Restaurando na VM via tunnel..."
docker run --rm \
  -e PGPASSWORD="$LOCAL_PGPASSWORD" \
  -v "$DUMPS:/dumps" \
  timescale/timescaledb:latest-pg15 \
  pg_restore \
    -h host.docker.internal -p 5433 \
    -U "$LOCAL_PGUSER" -d "$LOCAL_DB" \
    --clean --if-exists --no-owner --no-acl \
    /dumps/$(basename "$DUMP_FILE")

echo "==> Fechando tunnel..."
kill $TUNNEL_PID 2>/dev/null || true

echo "==> Sync concluído!"
