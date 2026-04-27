# FlightSearch

Monitoramento de passagens aéreas de **Recife para Europa** (Lisboa e Madrid).
Coleta preços diariamente via scraping do Skyscanner e monta pacotes comparáveis — tickets separados, ida e volta combinado, open jaw — ranqueados por score.

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend API | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Banco de dados | PostgreSQL |
| Scraper | Playwright (Chromium) — Skyscanner month view |
| Coletores auxiliares | Aviasales (Travelpayouts), Amadeus, SerpAPI |
| Scheduler | node-cron (coleta diária às 06:00 UTC) |
| Frontend | Next.js 16 + shadcn/ui + Tailwind CSS v4 |
| State management | TanStack Query v5 |

---

## Estrutura do Projeto

```
FlightSearch/
├── backend/
│   ├── src/
│   │   ├── api/routes/
│   │   │   ├── packages.ts      # GET  /api/packages
│   │   │   ├── routes.ts        # CRUD /api/routes
│   │   │   ├── snapshots.ts     # GET  /api/snapshots
│   │   │   └── collect.ts       # POST /api/collect
│   │   ├── collectors/
│   │   │   ├── skyscanner.ts    # Playwright scraper (fonte principal v1)
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
│   │   └── seed.ts              # Seed das 6 rotas padrão
│   ├── scripts/
│   │   ├── test-skyscanner.ts   # Teste isolado do scraper
│   │   └── clear-snapshots.ts   # Limpa todos os snapshots do banco
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── app/
│   │   ├── page.tsx             # Página principal
│   │   ├── dashboard/           # Dashboard de monitoramento
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── SearchPanel.tsx      # Formulário de busca (salvo no localStorage)
│   │   ├── FilterSidebar.tsx    # Filtros: paradas, companhia, ordenação
│   │   ├── PackageCard.tsx      # Card de pacote
│   │   └── PackageList.tsx      # Lista com skeleton + empty state
│   ├── lib/
│   │   ├── api.ts               # Cliente HTTP
│   │   ├── hooks.ts             # usePackages (TanStack Query)
│   │   └── types.ts             # Interfaces TypeScript
│   └── package.json
├── docker-compose.yml           # PostgreSQL + pgAdmin
└── docs/
    └── database-migration.md
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

pgAdmin disponível em `http://localhost:5050` (admin@admin.com / admin)

### 2. Backend

```bash
cd backend
cp .env.example .env
# Preencha as variáveis no .env (veja seção abaixo)

npm install
npm run install:playwright   # Instala o Chromium (~300MB) — necessário para o scraper

npx prisma db push           # Cria as tabelas
npm run db:seed              # Insere as 6 rotas padrão
npm run dev                  # Inicia em localhost:3001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev                  # Inicia em localhost:3000
```

---

## Variáveis de Ambiente (`backend/.env`)

```env
DATABASE_URL=postgresql://postgres:flighttracker@localhost:5432/flights

# Skyscanner Scraper — usa Playwright (sem quota de API)
# Execute `npm run install:playwright` para instalar o Chromium (~300MB)
SKYSCANNER_ENABLED=true
SKYSCANNER_HEADED=false    # true para abrir janela visível (debug local)

# Aviasales / Travelpayouts — https://travelpayouts.com/
AVIASALES_TOKEN=your_token_here

# Amadeus — https://developers.amadeus.com/
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret

# SerpAPI — https://serpapi.com/ (free: 250 queries/mês, usado para roundtrips)
SERPAPI_KEY=your_serpapi_key

# SearchAPI — https://searchapi.io/ (100 queries/mês free — comentado no scheduler v1)
# SEARCHAPI_KEY=your_searchapi_key

FRONTEND_URL=http://localhost:3000
PORT=3001
```

---

## Coletores de Dados

### Skyscanner Scraper (fonte principal — v1)

Raspa a view de calendário mensal do Skyscanner usando Playwright. Retorna o preço mais barato por dia para um mês inteiro, sem consumir quota de API.

- **Como funciona:** navega até `skyscanner.com.br/transporte/passagens-aereas/{origin}/{dest}/?oym={YYMM}`, aguarda o calendário carregar e extrai preços dos atributos `aria-label` de cada célula
- **Cobertura:** 12 meses por rota — mês atual + 11 seguintes (uma chamada por mês)
- **Anti-detecção:** browser headless com patches (remove `navigator.webdriver`), User-Agent real do Chrome, locale pt-BR, delays aleatórios de 5-10s entre meses e 8-15s entre rotas
- **Staleness gate:** só recoleta se o último snapshot for mais velho que 3 dias
- **Limitação:** não retorna companhia aérea, número de escalas ou duração — somente data + preço

**Testar isoladamente:**
```bash
npx tsx backend/scripts/test-skyscanner.ts REC MAD 2026-11
# Esperado: ~25-28 registros com priceBrl > 0
```

**Bot detection:** se headless for bloqueado pelo Cloudflare, adicione `SKYSCANNER_HEADED=true` no `.env` para abrir com janela visível.

### Coletores Auxiliares

| Coletor | API | Uso | Free tier |
|---------|-----|-----|-----------|
| `aviasales.ts` | Travelpayouts | Calendário mensal e preços baratos | Gratuito |
| `amadeus.ts` | Amadeus for Developers | Ofertas por data e amostra mensal | 10k calls/mês |
| `serpapi.ts` | SerpAPI | Roundtrips via Google Flights | 250 queries/mês |
| `searchapi.ts` | SearchAPI.io | Calendário Google Flights (comentado no scheduler v1) | 100 queries/mês |

---

## Scheduler

Coleta automática todo dia às **06:00 UTC** enquanto o servidor estiver ativo.

**Fluxo por rota (v1 — Skyscanner):**
1. Verifica staleness: pula se o último snapshot `source='skyscanner'` for menor que 3 dias
2. Gera lista de 12 meses (`YYYY-MM`): mês atual + 11 seguintes
3. Para cada mês: `fetchMonthView(origin, destination, yearMonth)`
4. Aguarda 5-10s (delay aleatório) entre meses
5. Aguarda 8-15s entre rotas
6. Salva todos os snapshots válidos (`priceBrl > 0`) no banco
7. Fecha o browser Playwright ao fim do run

**Coleta manual:**
```bash
cd backend
npm run collect
# Gera log em backend/logs/collect-{ISO-DATE}.log
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

**PriceAlert** — Alertas de preço (preparado para uso futuro)
```
id, routeId, thresholdBrl, isActive, createdAt, notifiedAt
```

**SearchQuery** — Buscas avançadas (preparado para multi-usuário)
```
id, userId, origins[], destinations[], minStayDays, maxStayDays,
departAfter, departBefore, alertEmail, isActive, createdAt, lastRunAt
```

### Comandos úteis

```bash
docker compose up -d           # Inicia PostgreSQL
npx prisma db push             # Aplica schema
npm run db:seed                # Insere 6 rotas padrão
npx prisma studio              # Interface visual (localhost:5555)
npm run db:clear-snapshots     # Limpa todos os snapshots
```

Backup/restore: veja `docs/database-migration.md`

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

## Package Assembler

O assembler combina snapshots de ida e volta para montar pacotes comparáveis, aplicando scoring e tags automáticas.

### Estratégias

| Estratégia | Descrição |
|-----------|-----------|
| `roundtrip_bundled` | Ticket único ida+volta (da fonte `tripType='roundtrip'`) |
| `separate_same` | Dois tickets oneway, mesmo aeroporto de retorno (ex: REC→MAD + MAD→REC) |
| `open_jaw` | Dois tickets oneway, aeroportos diferentes (ex: REC→MAD + LIS→REC) |

### Algoritmo de Score (0–100)

| Critério | Pontos |
|---------|--------|
| Preço no percentil mais baixo | até 40 |
| Ambos os voos diretos | 20 |
| Estadia ideal (20-30 dias) | 15 |
| Mesma companhia nos dois trechos | 15 |
| Dados recentes | 10 |

### Tags Automáticas

`mais_barato` — top 3 mais baratos  
`melhor_valor` — top 3 por score  
`direto` — ambos os trechos sem escala  
`open_jaw` — aeroportos de saída e chegada diferentes  
`mesma_cia` — mesma companhia nos dois trechos  
`longa_estadia` — 25+ dias

### Agrupamento

O endpoint `/api/packages` retorna grupos por `(data de saída, destino)`. Cada grupo contém a opção de ida mais barata e todas as opções de volta disponíveis (`returnOptions`), ordenadas por preço.

---

## API Reference

### GET /api/packages

Retorna pacotes agrupados por data de saída e destino.

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
| `maxPriceBrl` | number | — | Preço máximo total em BRL |
| `sameAirline` | boolean | — | Filtrar por mesma companhia |
| `sortBy` | string | `score` | `price` \| `score` \| `stayDays` |
| `limit` | number | `15` | Máximo de grupos retornados |
| `offset` | number | `0` | Paginação |

**Resposta:**
```json
{
  "groups": [
    {
      "id": "abc123",
      "departureDate": "2026-11-12",
      "flyTo": "MAD",
      "origin": "REC",
      "outbound": { "date": "...", "priceBrl": 1803, "stops": 0, ... },
      "cheapestPrice": 3606,
      "returnOptions": [
        { "returnDate": "...", "totalPriceBrl": 3606, "stayDays": 20, ... }
      ],
      "tags": ["mais_barato", "melhor_valor"]
    }
  ],
  "meta": {
    "total": 48,
    "cheapest": 3606,
    "lastCollected": "2026-04-10T06:00:00.000Z"
  }
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

**Criar rota:**
```bash
curl -X POST http://localhost:3001/api/routes \
  -H "Content-Type: application/json" \
  -d '{"origin":"REC","destination":"BCN","tripType":"oneway"}'
```

**Ativar/desativar rota:**
```bash
curl -X PATCH http://localhost:3001/api/routes/3 \
  -H "Content-Type: application/json" \
  -d '{"isActive":false}'
```

---

### Coleta

```
POST /api/collect              Dispara coleta de todas as rotas ativas
GET  /api/collect/status       Verifica se coleta está em andamento
POST /api/routes/:id/collect   Coleta apenas uma rota específica
```

---

### Outros

```
GET /api/snapshots    Snapshots brutos
                      Params: origin, destination, tripType, after, before, order
GET /health           Health check
```
