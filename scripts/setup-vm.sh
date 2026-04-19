#!/usr/bin/env bash
# Configuração inicial da Azure VM (Ubuntu 22.04)
# Rodar uma vez como azureuser: bash setup-vm.sh
set -euo pipefail

REPO="https://github.com/vsla/flight-price-dashboard.git"
APP_DIR="/opt/flightsearch"

echo "==> Atualizando pacotes"
sudo apt-get update -y && sudo apt-get upgrade -y

echo "==> Instalando Node.js 22 LTS"
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

echo "==> Instalando PM2"
sudo npm install -g pm2

echo "==> Instalando Docker"
sudo apt-get install -y docker.io docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"

echo "==> Instalando Nginx"
sudo apt-get install -y nginx

echo "==> Criando diretório da aplicação"
sudo mkdir -p "$APP_DIR"
sudo chown "$USER":"$USER" "$APP_DIR"

echo "==> Clonando repositório"
git clone "$REPO" "$APP_DIR"

echo "==> Configurando Nginx"
sudo cp "$APP_DIR/nginx.conf" /etc/nginx/sites-available/flightsearch
sudo ln -sf /etc/nginx/sites-available/flightsearch /etc/nginx/sites-enabled/flightsearch
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx

echo "==> Iniciando TimescaleDB"
cd "$APP_DIR"
docker compose up -d timescaledb
echo "   Aguardando banco ficar pronto..."
sleep 10

echo ""
echo "============================================================"
echo "  PRÓXIMOS PASSOS MANUAIS"
echo "============================================================"
echo ""
echo "1. Crie o arquivo de variáveis do backend:"
echo "   nano $APP_DIR/backend/.env"
echo ""
echo "   Conteúdo mínimo:"
echo "   DATABASE_URL=postgresql://postgres:flighttracker@localhost:5432/flights"
echo "   FRONTEND_URL=http://$(curl -s ifconfig.me)"
echo "   PORT=3001"
echo "   DISABLE_CRON=true"
echo "   AVIASALES_TOKEN=..."
echo "   AMADEUS_CLIENT_ID=..."
echo "   AMADEUS_CLIENT_SECRET=..."
echo "   SERPAPI_KEY=..."
echo ""
echo "2. Crie o arquivo de variáveis do frontend:"
echo "   nano $APP_DIR/frontend/.env.production"
echo ""
echo "   Conteúdo:"
echo "   NEXT_PUBLIC_API_URL=http://$(curl -s ifconfig.me)"
echo ""
echo "3. Execute o primeiro build e inicie os processos:"
echo "   cd $APP_DIR"
echo "   cd backend && npm ci --omit=dev && npm run build && cd .."
echo "   cd frontend && npm ci --omit=dev && npm run build && cd .."
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo ""
echo "4. Configure o PM2 para iniciar com o sistema:"
echo "   pm2 startup   # copie e execute o comando que aparecer"
echo ""
echo "5. Aplique as migrations do banco:"
echo "   cd $APP_DIR/backend && npx prisma migrate deploy"
echo ""
echo "6. Adicione os secrets no repositório GitHub:"
echo "   VM_HOST  = $(curl -s ifconfig.me)"
echo "   VM_USER  = $USER"
echo "   VM_SSH_KEY = (conteúdo da chave privada SSH)"
echo ""
echo "============================================================"
