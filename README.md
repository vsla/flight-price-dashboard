# Flight Price Tracker — Recife → Europa

Monitora automaticamente preços de passagens aéreas, armazena o histórico e exibe um dashboard interativo com flutuação de preços ao longo do tempo.

> **Contexto e motivação:** veja [docs/why.md](docs/why.md).

---

## Requisitos

- Python 3.11+
- Docker Desktop

---

## Instalação

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

Copie `.env.example` para `.env` e preencha as chaves de API.

---

## Configuração das APIs

| Variável | Serviço | Notas |
|---|---|---|
| `AVIASALES_TOKEN` | [travelpayouts.com](https://travelpayouts.com/) | Gratuito |
| `AMADEUS_CLIENT_ID` | [developers.amadeus.com](https://developers.amadeus.com/) | Usar ambiente **Production**, não sandbox |
| `AMADEUS_CLIENT_SECRET` | idem | Solicitar "Self-Service Production Access" após criar a conta (1–2 dias úteis) |

---

## Como rodar

```bash
# 1. Subir o banco
docker-compose up -d

# 2. Inicializar banco e rotas padrão
python -m src.main --init-only

# 3. Coleta manual (uma vez)
python -m src.main --once

# 4. Dashboard
streamlit run dashboard/app.py
# Acesse http://localhost:8501

# 5. Coleta automática diária (06:00)
python -m src.main
```

---

## Gerenciar rotas

```bash
# Listar todas as rotas
python scripts/routes.py list

# Adicionar uma rota
python scripts/routes.py add REC MAD oneway

# Coletar preços de uma rota agora
python scripts/routes.py fetch REC MAD oneway

# Desativar / reativar
python scripts/routes.py deactivate REC BCN
python scripts/routes.py activate REC BCN

# Deletar permanentemente
python scripts/routes.py delete REC BCN oneway
```

---

## Rotas padrão

| Rota | Tipo |
|---|---|
| REC → LIS | Só ida |
| REC → MAD | Só ida |
| LIS → REC | Só ida |
| MAD → REC | Só ida |
| REC → LIS → REC | Round-trip |
| REC → MAD → REC | Round-trip |

---

## Arquitetura

```
Scheduler (APScheduler, 06:00 diário)
        │
        ▼
Fetchers (aviasales.py + amadeus.py)
        │  Aviasales: 1 chamada = mês inteiro (calendário)
        │  Amadeus: fallback quando Aviasales não cobre a rota
        │           + validação do dia mais barato do mês
        ▼
TimescaleDB (PostgreSQL + extensão de séries temporais)
        │  price_snapshots: 1 linha por voo por coleta
        ▼
Dashboard Streamlit (5 abas de análise)
```

### Consumo de API estimado (coleta diária)

```
Aviasales calendar:  rotas cobertas × 12 meses  (~48 chamadas/dia)
Amadeus fallback:    rotas sem cobertura × 12 meses × ~8 datas/mês
Amadeus validação:   1 chamada por rota por mês
Total:               bem dentro do free tier (10.000 chamadas/mês Amadeus)
```

---

## Banco de dados

| Tabela | Descrição |
|---|---|
| `routes` | Rotas monitoradas. Gerencie via `scripts/routes.py`. |
| `price_snapshots` | Série histórica de preços. 1 linha por voo por coleta. |
| `price_alerts` | Alertas por rota e threshold de preço (fase 3). |

Usa **TimescaleDB** (extensão do PostgreSQL) para queries de séries temporais mais eficientes.

---

## Estrutura de arquivos

```
FlightSearch/
├── src/
│   ├── fetchers/
│   │   ├── aviasales.py     # Calendário mensal + cheap prices
│   │   └── amadeus.py       # OAuth2, flight offers, fallback mensal
│   ├── db/
│   │   ├── models.py        # Route, PriceSnapshot, PriceAlert
│   │   └── connection.py    # Engine, sessão, init_db(), rotas padrão
│   ├── scheduler.py         # Lógica de coleta com fallback Aviasales→Amadeus
│   └── main.py              # CLI: --once | --init-only | scheduler contínuo
├── dashboard/
│   ├── app.py               # App Streamlit
│   └── charts.py            # Visualizações Plotly
├── scripts/
│   └── routes.py            # CLI para gerenciar rotas
├── docs/
│   └── why.md               # Motivação e contexto do projeto
├── docker-compose.yml       # TimescaleDB + pgAdmin (porta 5050)
├── .env.example
└── requirements.txt
```

---

## Dashboard

| Aba | Descrição |
|---|---|
| Calendário de preços | Heatmap por mês/dia. Verde = barato, vermelho = caro. |
| Flutuação de uma data | Evolução do preço de um voo específico ao longo das semanas. |
| Top 10 mais baratos | Ranking das datas com menores preços nos próximos 12 meses. |
| Ida vs Ida+Volta | Comparativo mensal entre comprar só ida vs round-trip. |
| Sazonalidade | Preço médio por mês do ano. |

---

## Custo

| Cenário | Custo |
|---|---|
| Rodando no seu PC | R$ 0/mês |
| Cloud gratuita (Fly.io + Neon + Streamlit Cloud) | R$ 0/mês |
| Cloud paga (Railway + Supabase) | ~R$ 35/mês |

---

## Próximas evoluções

- Alertas por Telegram quando preço cair abaixo de um threshold configurado
- Deploy na nuvem para rodar 24/7 sem depender do PC local
- Análise de antecedência: comparar preços comprados com 3 vs 6 meses de antecedência
- Exportação CSV
