# Sincronizar banco local com a VM Azure

Envia o banco de dados PostgreSQL local para a VM Azure em um único comando.

```bash
bash scripts/sync-db-to-vm.sh
```

O script vai:
1. Fazer dump do banco local (`flightsearch_db` → `flights`) e salvar em `Dumps/`
2. Liberar a porta `5433` (mata tunnels anteriores que possam estar presos)
3. Abrir um tunnel SSH para a VM na porta `5433`
4. Dropar e recriar o banco `flights` na VM (evita conflitos de constraints)
5. Restaurar o dump limpo no banco recriado
6. Fechar o tunnel automaticamente

---

## Pré-requisitos

### 1. Docker Desktop rodando com o container ativo

```bash
docker compose up -d
docker ps   # confirmar que flightsearch_db aparece
```

### 2. Chave SSH configurada

Os scripts usam a variável de ambiente `FLIGHTSEARCH_KEY`. Defina-a no seu shell profile (`~/.zshrc` ou `~/.bash_profile`):

```bash
export FLIGHTSEARCH_KEY="/caminho/absoluto/para/FlightSearch_key.pem"
chmod 600 "$FLIGHTSEARCH_KEY"
```

Se a variável não estiver definida, o fallback é `$HOME/Dev/Keys/FlightSearch_key.pem`.

Teste a conexão antes de rodar o sync:

```bash
ssh -i "$FLIGHTSEARCH_KEY" azureuser@20.92.80.167 "echo ok"
```

### 3. VM Azure ligada

Verifique no portal Azure se a VM está em execução.

---

## Configurações em `scripts/config.sh`

| Variável | Valor padrão | Descrição |
|---|---|---|
| `KEY` | `$FLIGHTSEARCH_KEY` (ou `$HOME/Dev/Keys/FlightSearch_key.pem`) | Chave SSH |
| `VM_HOST` | `20.92.80.167` | IP público da VM Azure |
| `VM_USER` | `azureuser` | Usuário SSH |
| `LOCAL_CONTAINER` | `flightsearch_db` | Container Docker local |
| `LOCAL_DB` | `flights` | Nome do banco |
| `LOCAL_PGUSER` | `postgres` | Usuário PostgreSQL |
| `LOCAL_PGPASSWORD` | `flighttracker` | Senha PostgreSQL |

Se o IP da VM mudar, atualize `VM_HOST` nesse arquivo.

---

## Erros comuns

| Erro | Causa | Solução |
|---|---|---|
| `Docker not running` | Docker Desktop fechado | Abrir o Docker Desktop |
| `flightsearch_db não está rodando` | Stack não está up | `docker compose up -d` |
| `Permission denied (publickey)` | Chave SSH errada ou permissão 0644 | Verificar `$FLIGHTSEARCH_KEY` e rodar `chmod 600` |
| `Connection refused` | VM desligada | Ligar a VM no portal Azure |
| `pg_restore: already exists` | Schema conflitante na VM | Dropar e recriar o banco `flights` na VM antes de restaurar |
