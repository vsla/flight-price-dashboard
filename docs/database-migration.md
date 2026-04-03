# Copiar o banco de dados entre máquinas

Este guia descreve como exportar o PostgreSQL/TimescaleDB do **Docker** em um computador (por exemplo Windows) e importar em outro (por exemplo macOS), mantendo rotas, snapshots e histórico.

**Pré-requisitos:** Docker com o stack do projeto rodando (`docker compose up -d`), container do banco com o nome `flightsearch_db` (como em `docker-compose.yml`).

---

## O que copiar

| Item | Descrição |
|------|-----------|
| Arquivo de backup | `flights_backup.dump` (formato custom do `pg_dump`, binário) |
| `.env` | Chaves de API e `DATABASE_URL` — copie com segurança (não commite) |

O arquivo `*.dump` está no `.gitignore` para não ir parar no Git por acidente.

---

## Exportar (máquina de origem)

No diretório do projeto, com o container **ativo**:

### Windows (PowerShell)

```powershell
docker exec flightsearch_db pg_dump -U postgres -d flights -Fc --no-owner --no-acl -f /tmp/flights.dump
docker cp flightsearch_db:/tmp/flights.dump .\flights_backup.dump
docker exec flightsearch_db rm /tmp/flights.dump
```

### Linux / macOS (bash)

```bash
docker exec flightsearch_db pg_dump -U postgres -d flights -Fc --no-owner --no-acl -f /tmp/flights.dump
docker cp flightsearch_db:/tmp/flights.dump ./flights_backup.dump
docker exec flightsearch_db rm /tmp/flights.dump
```

**Sobre os avisos do `pg_dump`:** mensagens de *circular foreign-key constraints* em tabelas `hypertable` / `chunk` são comuns no TimescaleDB e não indicam falha do backup.

Transfira `flights_backup.dump` para a outra máquina (nuvem, USB, AirDrop, `scp`, etc.).

---

## Importar (máquina de destino)

1. Instale o projeto (Python, venv, `pip install -r requirements.txt`).
2. Copie o `.env` (ajuste `DATABASE_URL` se a porta ou senha forem diferentes).
3. Suba o banco:

   ```bash
   docker compose up -d
   ```

4. Com o arquivo `flights_backup.dump` na pasta do projeto, restaure:

   ```bash
   docker cp flights_backup.dump flightsearch_db:/tmp/flights.dump
   docker exec flightsearch_db pg_restore -U postgres -d flights --no-owner --no-acl --verbose /tmp/flights.dump
   ```

Se o comando terminar sem erro fatal, os dados foram aplicados.

---

## Banco já existente (conflito de schema)

Se você já rodou `init_db` ou já existe schema/tabelas no banco `flights`, o `pg_restore` pode falhar por objetos duplicados. Nesse caso, **recrie o banco vazio** e restaure de novo:

```bash
docker exec flightsearch_db psql -U postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'flights' AND pid <> pg_backend_pid();"
docker exec flightsearch_db psql -U postgres -c "DROP DATABASE flights;"
docker exec flightsearch_db psql -U postgres -c "CREATE DATABASE flights;"
docker cp flights_backup.dump flightsearch_db:/tmp/flights.dump
docker exec flightsearch_db pg_restore -U postgres -d flights --no-owner --no-acl --verbose /tmp/flights.dump
```

Depois disso, o app e o dashboard devem enxergar os mesmos dados da origem.

---

## Compatibilidade de versão

Use a **mesma família de imagem** em ambas as máquinas (no `docker-compose.yml` atual: **PostgreSQL 15 + TimescaleDB**). Dumps entre versões major diferentes de PostgreSQL podem exigir passos extras ou falhar.

---

## Conferência rápida

Após importar:

```bash
docker exec flightsearch_db psql -U postgres -d flights -c "SELECT COUNT(*) FROM price_snapshots;"
```

No dashboard Streamlit, use **Atualizar dados** na barra lateral para limpar o cache e recarregar.
