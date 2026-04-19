#!/usr/bin/env bash
# Chamado pelo GitHub Actions via SSH a cada push no main
set -euo pipefail

APP_DIR="/opt/flightsearch"
cd "$APP_DIR"

echo "==> git pull"
git pull origin main

echo "==> backend: install + generate + build"
cd backend
npm install
npx prisma generate
npx tsc
cd ..

echo "==> frontend: install + build"
cd frontend
npm install
npm run build -w frontend
cd ..

echo "==> pm2 restart"
pm2 restart ecosystem.config.js --update-env
pm2 save

echo "==> Deploy concluído"
