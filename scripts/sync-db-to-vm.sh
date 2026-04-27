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

echo "==> Liberando porta 5433 (tunnels anteriores)..."
lsof -ti:5433 | xargs kill -9 2>/dev/null || true
sleep 1

echo "==> Abrindo tunnel SSH (porta 5433)..."
ssh -i "$KEY" -L 5433:localhost:5432 "$VM_USER@$VM_HOST" -N -o ExitOnForwardFailure=yes &
TUNNEL_PID=$!

echo "    Aguardando tunnel ficar disponível..."
for i in $(seq 1 15); do
  if nc -z localhost 5433 2>/dev/null; then
    echo "    Tunnel pronto."
    break
  fi
  if [ "$i" -eq 15 ]; then
    echo "ERRO: tunnel não ficou disponível após 15s."
    kill "$TUNNEL_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "==> Recriando banco na VM (drop + create)..."
docker run --rm \
  -e PGPASSWORD="$LOCAL_PGPASSWORD" \
  timescale/timescaledb:latest-pg15 \
  psql -h host.docker.internal -p 5433 -U "$LOCAL_PGUSER" postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$LOCAL_DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS $LOCAL_DB;" \
  -c "CREATE DATABASE $LOCAL_DB WITH OWNER $LOCAL_PGUSER;"

echo "==> Restaurando na VM via tunnel..."
docker run --rm \
  -e PGPASSWORD="$LOCAL_PGPASSWORD" \
  -v "$DUMPS:/dumps" \
  timescale/timescaledb:latest-pg15 \
  pg_restore \
    -h host.docker.internal -p 5433 \
    -U "$LOCAL_PGUSER" -d "$LOCAL_DB" \
    --no-owner --no-acl \
    /dumps/$(basename "$DUMP_FILE")

echo "==> Fechando tunnel..."
kill "$TUNNEL_PID" 2>/dev/null || true

echo "==> Sync concluído!"
