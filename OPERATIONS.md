# FlightSearch — Guia de Operações

## Arquitetura

```
Internet → Nginx :80 (VM Azure 20.92.80.167)
              ├── /api/*  → Fastify backend  (PM2, :3001)
              └── /*      → Next.js frontend (PM2, :3000)
                                 └── TimescaleDB (Docker, :5432)

Sua máquina local
  ├── Docker → TimescaleDB local (:5432)
  ├── Coleta diária manual (Playwright + APIs)
  └── GitHub push → CI/CD automático
```

---

## Dev Local

### Setup inicial (uma vez)
```bash
# 1. Instalar dependências
cd backend && npm install
cd ../frontend && npm install

# 2. Subir banco local
docker compose up -d timescaledb

# 3. Criar backend/.env (copiar do exemplo)
cp backend/.env.example backend/.env
# Editar backend/.env com suas chaves de API

# 4. Rodar migrations
cd backend && npx prisma migrate dev

# 5. Seed das rotas padrão (REC↔LIS, REC↔MAD)
cd backend && npm run db:seed
```

### Rodar local
```bash
# Backend (porta 3001)
cd backend && npm run dev

# Frontend (porta 3000) — outro terminal
cd frontend && npm run dev
```

Acesse: http://localhost:3000

---

## CI/CD — Deploy Automático

### Como funciona
```
git push origin main
  → GitHub Actions (runner gratuito)
      → Build backend (prisma generate + tsc)
      → Build frontend (next build com NEXT_PUBLIC_API_URL)
      → rsync backend/dist/ e frontend/.next/ para VM
      → SSH: git pull + npm install --omit=dev + pm2 restart
```

### Deploy manual (sem push)
No GitHub → **Actions** → **Deploy to Azure VM** → **Run workflow**

### Acompanhar
```
github.com/vsla/flight-price-dashboard/actions
```

---

## VM Azure

### Acessar via SSH
```bash
bash scripts/ssh-vm.sh
```
Ou diretamente:
```bash
ssh -i "$HOME/OneDrive/Documentos/Dev/Keys/FlightSearch_key.pem" azureuser@20.92.80.167
```

### Verificar status dos processos
```bash
pm2 status
```

### Ver logs em tempo real
```bash
pm2 logs                        # todos
pm2 logs flightsearch-backend   # só backend
pm2 logs flightsearch-frontend  # só frontend
pm2 logs --lines 50             # últimas 50 linhas
```

### Reiniciar processos
```bash
pm2 restart all
pm2 restart flightsearch-backend
pm2 restart flightsearch-frontend
```

### Aplicar migration de schema (após alterar prisma/schema.prisma)
```bash
# Na VM
cd /opt/flightsearch/backend && npx prisma migrate deploy
```

---

## Banco de Dados

### Tunnel SSH (acesso remoto ao Postgres da VM)
```bash
bash scripts/tunnel-db.sh
```
Deixa o terminal aberto. Conecte em outro terminal ou DBeaver/pgAdmin:
```
host=localhost  port=5433  user=postgres  password=flighttracker  db=flights
```

### Sync local → VM (um comando)
```bash
bash scripts/sync-db-to-vm.sh
```
Faz dump do banco local e restaura na VM automaticamente.

### Backup local
```bash
# Dump completo (.dump — recomendado)
bash backend/scripts/dump-db.sh full

# Só dados (SQL)
bash backend/scripts/dump-db.sh data

# Schema + dados (SQL)
bash backend/scripts/dump-db.sh sql
```
Arquivos salvos em `Dumps/`.

### Restore local (de um dump)
```bash
# Para o container e limpa
docker compose down -v
docker compose up -d timescaledb
sleep 5

# Restaura
docker exec -i flightsearch_db pg_restore \
  -U postgres -d flights --clean --if-exists --no-owner --no-acl \
  < Dumps/<arquivo>.dump
```

### Admin visual do banco local
```bash
cd backend && npm run db:studio   # Prisma Studio em localhost:5555
```
Ou sobe o pgAdmin: http://localhost:5050 (admin@admin.com / admin)

---

## Coleta de Dados

### Coleta manual (local — necessário para Skyscanner com captcha)
```bash
cd backend && npm run collect
```
Ou via API:
```bash
curl -X POST http://localhost:3001/api/collect
```

### Status da coleta
```bash
curl http://localhost:3001/api/collect/status
```

### Limpar todos os snapshots
```bash
cd backend && npm run db:clear-snapshots
```

### Testar scraper Skyscanner isolado
```bash
npx tsx backend/scripts/test-skyscanner.ts REC MAD 2026-11
```

---

## Rotinas Comuns

| Rotina | Comando |
|--------|---------|
| Entrar na VM | `bash scripts/ssh-vm.sh` |
| Abrir tunnel DB | `bash scripts/tunnel-db.sh` |
| Sync dados local → VM | `bash scripts/sync-db-to-vm.sh` |
| Backup local | `bash backend/scripts/dump-db.sh full` |
| Coletar dados | `cd backend && npm run collect` |
| Deploy manual | GitHub Actions → Run workflow |
| Ver logs VM | SSH → `pm2 logs` |
| Reiniciar VM | SSH → `pm2 restart all` |
| Admin DB local | `cd backend && npm run db:studio` |

---

## GitHub Secrets

Configurados em: **Settings → Secrets and variables → Actions**

| Secret | Valor | Para quê |
|--------|-------|----------|
| `VM_HOST` | `20.92.80.167` | IP da VM Azure |
| `VM_USER` | `azureuser` | Usuário SSH |
| `VM_SSH_KEY` | conteúdo do `FlightSearch_key.pem` | Autenticação SSH |

---

## Arquivos de Configuração

| Arquivo | Onde | O que contém |
|---------|------|-------------|
| `backend/.env` | local + VM | DATABASE_URL, API keys, DISABLE_CRON, PORT |
| `frontend/.env.production` | VM apenas | NEXT_PUBLIC_API_URL (gerado no CI) |
| `scripts/config.sh` | local | IP da VM, caminho da chave SSH |
| `ecosystem.config.js` | raiz | Config PM2 (processos backend e frontend) |
| `nginx.conf` | raiz | Config Nginx da VM |

**Nunca commitar:** `backend/.env`, `frontend/.env.production`, `frontend/.env.local`

---

## Troubleshooting

### App não abre (http://20.92.80.167)
```bash
# Na VM
pm2 status          # processos rodando?
pm2 logs --lines 20 # erro nos logs?
sudo nginx -t       # config nginx ok?
sudo systemctl status nginx
```

### Backend não conecta no banco
```bash
# Na VM
docker ps  # container flightsearch_db rodando?
docker compose up -d timescaledb
```

### Deploy falhou no GitHub Actions
- Verificar aba Actions → step com erro
- Erros comuns: timeout (aumentar `command_timeout`), chave SSH inválida, VM desligada

### VM reiniciou e app não voltou
```bash
# Na VM — PM2 deve subir automaticamente, mas se não:
pm2 resurrect
# ou
pm2 start /opt/flightsearch/ecosystem.config.js
pm2 save
```

### IP da VM mudou
1. Atualizar `scripts/config.sh`
2. Atualizar secrets do GitHub (`VM_HOST`)
3. Fazer push para rebuildar o frontend com o novo IP
