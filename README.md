# FlightSearch

Monitoramento inteligente de passagens aéreas de **Recife para Europa** (Lisboa e Madrid).
Coleta preços diariamente e monta pacotes comparáveis — tickets separados, ida e volta combinado, open jaw — ranqueados por score.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Scheduler | node-cron (coleta diária às 06:00) |
| Banco de dados | PostgreSQL + TimescaleDB |
| Frontend | Next.js 16 + shadcn/ui + Tailwind CSS |
| State management | TanStack Query v5 |

---

## Estrutura do Projeto

```
FlightSearch/
├── backend/
│   ├── src/
│   │   ├── api/routes/        # Endpoints REST
│   │   │   ├── packages.ts    # GET  /api/packages
│   │   │   ├── routes.ts      # CRUD /api/routes
│   │   │   ├── snapshots.ts   # GET  /api/snapshots
│   │   │   └── collect.ts     # POST /api/collect
│   │   ├── collectors/
│   │   │   ├── aviasales.ts   # Travelpayouts API (primário)
│   │   │   ├── amadeus.ts     # Amadeus API (fallback + validação)
│   │   │   └── serpapi.ts     # SerpAPI Google Flights (roundtrips)
│   │   ├── scheduler/
│   │   │   └── index.ts       # Orquestração da coleta diária
│   │   ├── packages/
│   │   │   └── assembler.ts   # Monta e ranqueia pacotes de viagem
│   │   ├── index.ts           # Entry point do servidor
│   │   └── collect.ts         # Script de coleta manual
│   ├── prisma/
│   │   ├── schema.prisma      # Models: Route, PriceSnapshot, PriceAlert, SearchQuery
│   │   └── seed.ts            # Seed das 6 rotas padrão
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/                   # Next.js App Router
│   ├── components/
│   │   ├── SearchPanel.tsx    # Formulário de busca (salvo no localStorage)
│   │   ├── FilterSidebar.tsx  # Filtros: paradas, companhia, ordenação
│   │   ├── PackageCard.tsx    # Card de pacote com imagem Unsplash
│   │   └── PackageList.tsx    # Lista com skeleton + empty state
│   ├── lib/
│   │   ├── api.ts             # Cliente HTTP + buildGoogleFlightsUrl
│   │   ├── hooks.ts           # usePackages (TanStack Query) + usePersistedFilters
│   │   └── types.ts           # Interfaces TypeScript compartilhadas
│   └── package.json
├── docker-compose.yml         # TimescaleDB + pgAdmin
├── docs/
│   └── database-migration.md
└── Dumps/                     # Backups do banco
```

---

## Pré-requisitos

- Node.js 20+
- Docker (para o banco de dados)

---

## Setup

### 1. Banco de dados

```bash
docker compose up -d
```

Acesso ao pgAdmin: `http://localhost:5050` (admin@admin.com / admin)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Preencha as credenciais das APIs no .env

npm install
npx prisma db push        # Cria as tabelas
npm run db:seed           # Insere as 6 rotas padrão
npm run dev               # Inicia em localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev               # Inicia em localhost:3000
```

---

## Variáveis de Ambiente (`backend/.env`)

```env
DATABASE_URL="postgresql://postgres:flighttracker@localhost:5432/flights"

# Aviasales / Travelpayouts — https://travelpayouts.com/
AVIASALES_TOKEN=your_token_here

# Amadeus — https://developers.amadeus.com/
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret

# SerpAPI — https://serpapi.com/ (free: 250 queries/mês)
SERPAPI_KEY=your_serpapi_key

FRONTEND_URL=http://localhost:3000
PORT=3001
```

### APIs utilizadas

| API | Uso | Free tier |
|-----|-----|-----------|
| **Aviasales/Travelpayouts** | Calendário de preços oneway (primário) | Gratuito |
| **Amadeus** | Fallback + validação do dia mais barato | 10k chamadas/mês |
| **SerpAPI** | Roundtrips via Google Flights | 250 queries/mês |

---

## API Reference

### GET /api/packages
Retorna pacotes de viagem montados e ranqueados.

**Query params:**

| Param | Tipo | Default | Descrição |
|-------|------|---------|-----------|
| `destinations` | string | `LIS,MAD` | Códigos IATA separados por vírgula |
| `minStayDays` | number | `5` | Mínimo de dias de estadia |
| `maxStayDays` | number | `60` | Máximo de dias de estadia |
| `departAfter` | date | hoje | Data mínima de partida (YYYY-MM-DD) |
| `departBefore` | date | — | Data máxima de partida |
| `returnBefore` | date | — | Data máxima de retorno |
| `maxStops` | number | — | Máximo de paradas (0 = direto) |
| `sameAirline` | boolean | — | Filtrar por mesma companhia |
| `sortBy` | string | `score` | `price` \| `score` \| `stayDays` |
| `limit` | number | `50` | Máximo de resultados |

**Estratégias de pacote:**
- `roundtrip_bundled` — ticket único ida+volta
- `separate_same` — dois tickets, mesmo aeroporto de retorno
- `open_jaw` — vai para X, volta de Y (ex: REC→MAD + LIS→REC)

**Tags automáticas:** `mais_barato`, `direto`, `melhor_valor`, `open_jaw`, `mesma_cia`, `longa_estadia`

---

### Gerenciamento de Rotas

```
GET    /api/routes            Lista todas as rotas
POST   /api/routes            Cria nova rota
PATCH  /api/routes/:id        Ativa ou desativa uma rota
DELETE /api/routes/:id        Remove rota e seus snapshots
POST   /api/routes/:id/collect  Coleta manual para uma rota
```

**Criar rota:**
```bash
curl -X POST http://localhost:3001/api/routes \
  -H "Content-Type: application/json" \
  -d '{"origin":"REC","destination":"BCN","tripType":"oneway"}'
```

**Desativar rota:**
```bash
curl -X PATCH http://localhost:3001/api/routes/3 \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

---

### Coleta

```
POST /api/collect              Coleta todas as rotas ativas
GET  /api/collect/status       Verifica se coleta está rodando
POST /api/routes/:id/collect   Coleta apenas uma rota
```

### Outros

```
GET /api/snapshots    Snapshots brutos (params: origin, destination, tripType, after, before)
GET /health           Health check
```

---

## Coleta Manual via Script

```bash
cd backend
npm run collect
```

---

## Rotas Padrão (seed)

| Origem | Destino | Tipo |
|--------|---------|------|
| REC | LIS | oneway |
| REC | MAD | oneway |
| LIS | REC | oneway |
| MAD | REC | oneway |
| REC | LIS | roundtrip |
| REC | MAD | roundtrip |

---

## Scheduler

Coleta automática todo dia às **06:00** enquanto o servidor estiver ativo.

**Lógica por rota:**
1. **Oneway:** Aviasales calendar → fallback Amadeus → validação Amadeus no dia mais barato
2. **Roundtrip:** SerpAPI nas 5 datas mais baratas → Amadeus como complemento

---

## Banco de Dados

```bash
docker compose up -d           # Inicia TimescaleDB
npx prisma db push             # Aplica schema
npx prisma studio              # Interface visual (localhost:5555)
```

Backup/restore: veja `docs/database-migration.md`
