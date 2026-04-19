#!/usr/bin/env bash
# Chamado pelo GitHub Actions via SSH a cada push no main
set -euo pipefail

APP_DIR="/opt/flightsearch"
cd "$APP_DIR"

echo "==> git pull"
git pull origin main

echo "==> backend: install + build"
cd backend
npm ci --omit=dev
npm run build
cd ..

echo "==> frontend: install + build"
cd frontend
npm ci --omit=dev
npm run build
cd ..

echo "==> pm2 restart"
pm2 restart ecosystem.config.js --update-env
pm2 save

echo "==> Deploy concluído"
