# FlightSearch

Monitoramento de passagens aéreas de **Recife para Europa** (Lisboa, Madrid, Porto).
Coleta preços diariamente via HTTP e APIs externas, monta pacotes comparáveis — tickets separados, ida e volta combinado, open jaw — e os exibe em um calendário de preços interativo.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Banco de dados | PostgreSQL (TimescaleDB) |
| Scraper | HTTP client direto (Skyscanner monthviewservice, sem browser) |
| Coletores auxiliares | Aviasales (Travelpayouts), Amadeus, SerpAPI |
| Scheduler | node-cron (coleta diária às 06:00 UTC) |
| Frontend | Next.js 16 + Tailwind CSS v4 + shadcn/ui |
| State management | TanStack Query v5 |

---

## Estrutura do Projeto

```
flight-price-dashboard/
├── backend/
│   ├── src/
│   │   ├── api/routes/
│   │   │   ├── calendar.ts      # GET  /api/calendar
│   │   │   ├── packages.ts      # GET  /api/packages
│   │   │   ├── routes.ts        # CRUD /api/routes
│   │   │   ├── snapshots.ts     # GET  /api/snapshots
│   │   │   └── collect.ts       # POST /api/collect
│   │   ├── collectors/
│   │   │   ├── skyscanner.ts    # HTTP direto ao monthviewservice
│   │   │   ├── aviasales.ts     # Travelpayouts API
│   │   │   ├── amadeus.ts       # Amadeus API
│   │   │   ├── serpapi.ts       # SerpAPI — Google Flights (roundtrips)
│   │   │   ├── searchapi.ts     # SearchAPI — Google Flights Calendar
│   │   │   └── types.ts         # Interface FlightRecord
│   │   ├── scheduler/
│   │   │   └── index.ts         # Orquestração da coleta diária
│   │   ├── packages/
│   │   │   └── assembler.ts     # Monta e ranqueia pacotes de viagem
│   │   ├── index.ts             # Entry point do servidor
│   │   └── collect.ts           # Script de coleta manual (npm run collect)
│   ├── prisma/
│   │   ├── schema.prisma        # Models: Route, PriceSnapshot, PriceAlert, SearchQuery
│   │   └── seed.ts              # Seed das rotas padrão
│   ├── scripts/
│   │   └── clear-snapshots.ts   # Limpa todos os snapshots do banco
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # /         — Explorar preços (calendário + cards)
│   │   ├── planejar/page.tsx    # /planejar — Busca guiada (destino + duração)
│   │   ├── dashboard/page.tsx   # /dashboard — Dados brutos + stats
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── CalendarPanel.tsx    # Heatmap de preços por data (clicável)
│   │   ├── DealCard.tsx         # Card de pacote com links Google Flights + Skyscanner
│   │   ├── DealsGrid.tsx        # Grid responsivo com scroll infinito
│   │   ├── MonthPills.tsx       # Filtro de mês (multi-select horizontal)
│   │   └── NavBar.tsx           # Navbar compartilhada (mobile-friendly)
│   ├── lib/
│   │   ├── api.ts               # Cliente HTTP + helpers de URL
│   │   ├── hooks.ts             # useCalendar, useInfinitePackages, usePersistedFilters
│   │   └── types.ts             # Interfaces TypeScript
│   └── package.json
├── scripts/
│   ├── config.sh                # IP da VM, chave SSH (usa $FLIGHTSEARCH_KEY)
│   ├── ssh-vm.sh                # Abre SSH na VM
│   ├── tunnel-db.sh             # Tunnel SSH para o banco da VM
│   └── sync-db-to-vm.sh         # Dump local + restore na VM
├── docs/
│   ├── sync-db-to-vm.md         # Guia de sincronização do banco
│   └── database-migration.md
├── docker-compose.yml           # TimescaleDB + pgAdmin local
├── OPERATIONS.md                # Guia de deploy, VM e operações
└── .env.example                 # Variáveis de ambiente do backend
```

---

## Pré-requisitos

- Node.js 20+
- Docker Desktop

---

## Setup Local

### 1. Banco de dados

```bash
docker compose up -d
```

pgAdmin disponível em `http://localhost:5050` (admin@admin.com / admin)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Preencha as variáveis no .env (veja seção abaixo)

npm install
npx prisma db push    # Cria as tabelas
npm run db:seed       # Insere as rotas padrão
npm run dev           # Inicia em localhost:3001
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env.local
# Ajuste NEXT_PUBLIC_API_URL se necessário

npm install
npm run dev           # Inicia em localhost:3000
```

---

## Variáveis de Ambiente

### `backend/.env`

```env
DATABASE_URL=postgresql://postgres:flighttracker@localhost:5432/flights

# Skyscanner — HTTP direto (sem browser)
# Cookies: DevTools → Network → /pricecalendar → copiar header "cookie"
# Renovar quando receber HTTP 403
SKYSCANNER_ENABLED=true
SKYSCANNER_COOKIES=

# Aviasales / Travelpayouts — https://travelpayouts.com/
AVIASALES_TOKEN=

# Amadeus — https://developers.amadeus.com/ (usar produção, não sandbox)
AMADEUS_CLIENT_ID=
AMADEUS_CLIENT_SECRET=

# SerpAPI — https://serpapi.com/ (250 queries/mês free)
SERPAPI_KEY=

FRONTEND_URL=http://localhost:3000
PORT=3001

# Desativa o cron (false = roda cron; true = só API, sem coleta automática)
DISABLE_CRON=false
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## Coletores de Dados

### Skyscanner (fonte principal)

Chama o endpoint interno `monthviewservice` que a página de calendário do Skyscanner usa. Retorna o preço mais barato por dia para um mês inteiro, sem browser nem Playwright.

- **Como funciona:** HTTP GET com cookies de sessão válidos → resposta JSON com preços diários
- **Cobertura:** 12 meses por rota (mês atual + 11 seguintes)
- **Renovação de cookies:** quando receber HTTP 403, obter novos cookies via DevTools e atualizar `SKYSCANNER_COOKIES` no `.env`
- **Limitação:** não retorna companhia aérea, número de escalas ou duração — somente data + preço

### Coletores Auxiliares

| Coletor | API | Free tier |
|---------|-----|-----------|
| `aviasales.ts` | Travelpayouts | Gratuito |
| `amadeus.ts` | Amadeus for Developers | 10k calls/mês |
| `serpapi.ts` | SerpAPI | 250 queries/mês |
| `searchapi.ts` | SearchAPI.io | 100 queries/mês |

---

## Scheduler

Coleta automática todo dia às **06:00 UTC**.

**Coleta manual:**
```bash
cd backend && npm run collect
```

**Via API:**
```bash
curl -X POST http://localhost:3001/api/collect
curl http://localhost:3001/api/collect/status
```

---

## Banco de Dados

### Schema

**Route** — Rotas monitoradas
```
id, origin (IATA), destination (IATA), tripType (oneway|roundtrip), isActive, createdAt
Unique: (origin, destination, tripType)
```

**PriceSnapshot** — Snapshots de preço coletados
```
id, collectedAt, routeId, flightDate, returnDate, airline, priceBrl, priceEur,
stops, durationMinutes, source (skyscanner|aviasales|amadeus|serpapi|searchapi)
```

### Comandos úteis

```bash
docker compose up -d           # Inicia o banco
npx prisma db push             # Aplica schema (sem migration history)
npm run db:seed                # Insere rotas padrão
cd backend && npm run db:studio  # Prisma Studio (localhost:5555)
npm run db:clear-snapshots     # Limpa todos os snapshots
```

---

## Rotas Padrão (seed)

| Origem | Destino | Tipo |
|--------|---------|------|
| REC | LIS | oneway |
| REC | MAD | oneway |
| REC | OPO | oneway |
| LIS | REC | oneway |
| MAD | REC | oneway |
| OPO | REC | oneway |
| REC | LIS | roundtrip |
| REC | MAD | roundtrip |

---

## Package Assembler

Combina snapshots de ida e volta para montar pacotes comparáveis, com scoring e tags automáticas.

### Estratégias

| Estratégia | Descrição |
|-----------|-----------|
| `roundtrip_bundled` | Ticket único ida+volta (`tripType='roundtrip'`) |
| `separate_same` | Dois tickets oneway, mesmo aeroporto de retorno (REC→MAD + MAD→REC) |
| `open_jaw` | Dois tickets oneway, aeroportos diferentes (REC→MAD + LIS→REC) |

### Score (0–100)

| Critério | Pontos |
|---------|--------|
| Preço no percentil mais baixo | até 40 |
| Ambos os voos diretos | 20 |
| Estadia ideal 20–30 dias | 15 |
| Mesma companhia nos dois trechos | 15 |
| Dados recentes | 10 |

### Tags automáticas

`mais_barato` · `melhor_valor` · `direto` · `open_jaw` · `mesma_cia` · `longa_estadia`

---

## API Reference

### GET /api/calendar

Retorna o preço mais barato de round-trip por data de saída e destino. Usado pelo heatmap do calendário.

**Query params:**

| Param | Default | Descrição |
|-------|---------|-----------|
| `destinations` | `LIS,MAD,OPO` | Códigos IATA separados por vírgula |
| `departAfter` | hoje | Data mínima de partida (YYYY-MM-DD) |
| `departBefore` | hoje + 12 meses | Data máxima de partida |
| `minStayDays` | `14` | Mínimo de dias de estadia |
| `maxStayDays` | `30` | Máximo de dias de estadia |

**Resposta:**
```json
{
  "days": [
    { "date": "2026-11-10", "destination": "MAD", "cheapestPrice": 4800 },
    { "date": "2026-11-10", "destination": "LIS", "cheapestPrice": 5100 }
  ]
}
```

---

### GET /api/packages

Retorna pacotes agrupados por data de saída e destino.

**Query params:**

| Param | Default | Descrição |
|-------|---------|-----------|
| `destinations` | `LIS,MAD` | Códigos IATA separados por vírgula |
| `minStayDays` | `5` | Mínimo de dias de estadia |
| `maxStayDays` | `60` | Máximo de dias de estadia |
| `departAfter` | hoje | Data mínima de partida (YYYY-MM-DD) |
| `departBefore` | — | Data máxima de partida |
| `returnBefore` | — | Data máxima de retorno |
| `maxStops` | — | Máximo de paradas (0 = direto) |
| `maxPriceBrl` | — | Preço máximo total em BRL |
| `sameAirline` | — | Filtrar por mesma companhia |
| `sortBy` | `score` | `price` \| `score` \| `stayDays` |
| `limit` | `15` | Máximo de grupos retornados |
| `offset` | `0` | Paginação |

**Resposta:**
```json
{
  "groups": [
    {
      "id": "abc123",
      "departureDate": "2026-11-12",
      "flyTo": "MAD",
      "origin": "REC",
      "outbound": { "date": "2026-11-12", "priceBrl": 1803, "stops": 0 },
      "cheapestPrice": 3606,
      "returnOptions": [
        { "returnDate": "2026-12-02", "totalPriceBrl": 3606, "stayDays": 20 }
      ],
      "tags": ["mais_barato", "melhor_valor"]
    }
  ],
  "meta": { "total": 48, "cheapest": 3606, "lastCollected": "2026-04-27T06:00:00.000Z" }
}
```

---

### Rotas

```
GET    /api/routes                  Lista todas as rotas
POST   /api/routes                  Cria nova rota
PATCH  /api/routes/:id              Ativa ou desativa uma rota
DELETE /api/routes/:id              Remove rota e seus snapshots
POST   /api/routes/:id/collect      Coleta manual para uma rota
```

### Coleta

```
POST /api/collect              Dispara coleta de todas as rotas ativas
GET  /api/collect/status       Verifica se coleta está em andamento
```

### Outros

```
GET /api/snapshots    Snapshots brutos (params: origin, destination, tripType, after, before, order)
GET /health           Health check
```
