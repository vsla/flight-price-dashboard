#!/usr/bin/env bash
# Abre SSH tunnel: localhost:5433 → VM PostgreSQL:5432
# Use para conectar via DBeaver, pgAdmin, psql, etc.
# Conexão: host=localhost port=5433 user=postgres password=flighttracker db=flights
source "$(dirname "$0")/config.sh"
echo "Tunnel aberto: localhost:5433 -> VM:5432"
echo "Conecte com: host=localhost port=5433 user=postgres password=flighttracker db=flights"
echo "Pressione Ctrl+C para fechar."
ssh -i "$KEY" -L 5433:localhost:5432 $VM_USER@$VM_HOST -N
