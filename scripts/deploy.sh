#!/usr/bin/env bash
# Chamado pelo GitHub Actions via SSH a cada push no main
set -euo pipefail

APP_DIR="/opt/flightsearch"
cd "$APP_DIR"

echo "==> git pull"
git pull origin main

echo "==> install (workspace root)"
npm ci --omit=dev

echo "==> backend: generate + build"
cd backend
npx prisma generate
npx tsc
cd ..

echo "==> frontend: build"
cd frontend
../node_modules/.bin/next build
cd ..

echo "==> pm2 restart"
pm2 restart ecosystem.config.js --update-env
pm2 save

echo "==> Deploy concluído"
