# FlightSearch — Guia de Operações

## Arquitetura

```
Internet → Nginx :80 (VM Azure 20.92.80.167)
              ├── /api/*  → Fastify backend  (PM2, :3001)
              └── /*      → Next.js frontend (PM2, :3000)
                                 └── TimescaleDB (Docker, :5432)

Sua máquina local
  ├── Docker → TimescaleDB local (:5432)
  ├── Coleta diária manual (HTTP + APIs)
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
docker compose up -d

# 3. Criar backend/.env (copiar do exemplo)
cp backend/.env.example backend/.env
# Editar backend/.env com suas chaves de API

# 4. Criar tabelas
cd backend && npx prisma db push

# 5. Seed das rotas padrão
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

GitHub → **Actions** → **Deploy to Azure VM** → **Run workflow**

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

### Aplicar mudança de schema

```bash
# Na VM
cd /opt/flightsearch/backend && npx prisma db push
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

Faz dump do banco local e restaura na VM automaticamente. Veja `docs/sync-db-to-vm.md` para pré-requisitos.

### Backup local

```bash
bash backend/scripts/dump-db.sh full    # .dump (recomendado)
bash backend/scripts/dump-db.sh data    # só dados (SQL)
bash backend/scripts/dump-db.sh sql     # schema + dados (SQL)
```

Arquivos salvos em `Dumps/`.

### Restore local (de um dump)

```bash
docker compose down -v
docker compose up -d
sleep 5
docker exec -i flightsearch_db pg_restore \
  -U postgres -d flights --clean --if-exists --no-owner --no-acl \
  < Dumps/<arquivo>.dump
```

### Admin visual do banco local

```bash
cd backend && npm run db:studio   # Prisma Studio em localhost:5555
```

Ou pgAdmin: http://localhost:5050 (admin@admin.com / admin)

---

## Coleta de Dados

### Coleta manual

```bash
cd backend && npm run collect
```

Ou via API:

```bash
curl -X POST http://localhost:3001/api/collect
curl http://localhost:3001/api/collect/status
```

### Skyscanner — renovar cookies

O coletor usa HTTP direto ao `monthviewservice`. Quando retornar HTTP 403:

1. Abrir skyscanner.com.br no browser
2. DevTools → Network → clicar em qualquer requisição `/pricecalendar`
3. Copiar o header `cookie` completo
4. Atualizar `SKYSCANNER_COOKIES` no `backend/.env`

### Limpar snapshots

```bash
cd backend && npm run db:clear-snapshots
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
| `frontend/.env.local` | local | NEXT_PUBLIC_API_URL |
| `frontend/.env.production` | VM (gerado no CI) | NEXT_PUBLIC_API_URL com IP da VM |
| `scripts/config.sh` | local | IP da VM, usuário SSH, container Docker |
| `ecosystem.config.js` | raiz | Config PM2 |
| `nginx.conf` | raiz | Config Nginx da VM |

**Nunca commitar:** `backend/.env`, `frontend/.env.local`, `frontend/.env.production`

### Chave SSH (`$FLIGHTSEARCH_KEY`)

Os scripts usam a variável de ambiente `FLIGHTSEARCH_KEY` para localizar a chave SSH:

```bash
# Adicionar ao ~/.zshrc ou ~/.bash_profile
export FLIGHTSEARCH_KEY="$HOME/caminho/para/FlightSearch_key.pem"
chmod 600 "$FLIGHTSEARCH_KEY"
```

Se a variável não estiver definida, `scripts/config.sh` usa o fallback `$HOME/Dev/Keys/FlightSearch_key.pem`.

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
docker compose up -d
```

### Deploy falhou no GitHub Actions

- Verificar aba Actions → step com erro
- Erros comuns: timeout SSH, chave SSH inválida, VM desligada

### VM reiniciou e app não voltou

```bash
# Na VM
pm2 resurrect
# ou
pm2 start /opt/flightsearch/ecosystem.config.js
pm2 save
```

### IP da VM mudou

1. Atualizar `VM_HOST` em `scripts/config.sh`
2. Atualizar secret `VM_HOST` no GitHub
3. Fazer push para rebuildar o frontend com o novo IP
