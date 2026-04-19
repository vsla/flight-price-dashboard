#!/usr/bin/env bash
# Chamado pelo GitHub Actions via SSH a cada push no main
set -euo pipefail

cd /opt/flightsearch

echo "==> git pull"
git pull origin main

echo "==> install + build"
npm install
npm run build

echo "==> pm2 restart"
pm2 restart ecosystem.config.js --update-env
pm2 save

echo "==> Deploy concluído"
