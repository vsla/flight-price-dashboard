# Sincronizar banco local com a VM Azure

Este guia explica como enviar o banco de dados PostgreSQL local para a VM Azure usando o script `scripts/sync-db-to-vm.sh`.

---

## Pré-requisitos

### 1. Docker Desktop rodando

O Docker Desktop precisa estar **aberto e com o engine Linux ativo**. O erro abaixo indica que o Docker não está rodando:

```
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Abra o Docker Desktop e aguarde o ícone na bandeja do sistema ficar verde antes de continuar.

### 2. Container do banco local ativo

Com o Docker rodando, suba o stack do projeto:

```bash
docker compose up -d
```

Confirme que o container `flightsearch_db` está ativo:

```bash
docker ps
```

### 3. Chave SSH da VM configurada

O script usa a chave SSH definida em `scripts/config.sh`:

```bash
KEY="../../Keys/FlightSearch_key.pem"
```

Esse caminho é **relativo à pasta `scripts/`**, ou seja, o arquivo `.pem` deve estar em:

```
<pasta-pai-do-projeto>/Keys/FlightSearch_key.pem
```

Exemplo: se o projeto está em `C:\Users\victo\OneDrive\Documentos\Dev\FlightSearch`, a chave deve estar em `C:\Users\victo\OneDrive\Documentos\Dev\Keys\FlightSearch_key.pem`.

Certifique-se de que:
- O arquivo `.pem` existe nesse caminho
- As permissões estão corretas (no WSL/Git Bash pode precisar de `chmod 400`)

Para verificar:

```bash
ls scripts/../../Keys/FlightSearch_key.pem
```

### 4. VM Azure acessível

A VM deve estar **ligada** no portal Azure. O IP configurado é `20.92.80.167`. Teste a conectividade:

```bash
ssh -i "$HOME/OneDrive/Documentos/Dev/Keys/FlightSearch_key.pem" azureuser@20.92.80.167 "echo ok"
```

---

## Como rodar

Com todos os pré-requisitos atendidos, execute na raiz do projeto:

```bash
bash scripts/sync-db-to-vm.sh
```

O script vai:
1. Gerar um dump do banco local (`flightsearch_db` → banco `flights`)
2. Salvar o arquivo em `Dumps/sync-<timestamp>.dump`
3. Abrir um tunnel SSH para a VM na porta `5433`
4. Restaurar o dump no PostgreSQL da VM via esse tunnel
5. Fechar o tunnel automaticamente

---

## Configurações em `scripts/config.sh`

| Variável | Valor padrão | Descrição |
|---|---|---|
| `KEY` | `../../Keys/FlightSearch_key.pem` | Caminho para a chave SSH (relativo a `scripts/`) |
| `VM_HOST` | `20.92.80.167` | IP público da VM Azure |
| `VM_USER` | `azureuser` | Usuário SSH da VM |
| `LOCAL_CONTAINER` | `flightsearch_db` | Nome do container Docker local |
| `LOCAL_DB` | `flights` | Nome do banco de dados |
| `LOCAL_PGUSER` | `postgres` | Usuário do PostgreSQL |
| `LOCAL_PGPASSWORD` | `flighttracker` | Senha do PostgreSQL |

Se o IP da VM mudar, atualize `VM_HOST` nesse arquivo.

---

## Erros comuns

| Erro | Causa | Solução |
|---|---|---|
| `failed to connect to the docker API` | Docker Desktop não está rodando | Abrir o Docker Desktop |
| `Container flightsearch_db não está rodando` | Stack do projeto não está up | `docker compose up -d` |
| `Permission denied (publickey)` | Chave SSH errada ou sem permissão | Verificar o caminho em `config.sh` e rodar `chmod 400` na chave |
| `ssh: connect to host ... port 22: Connection refused` | VM Azure desligada | Ligar a VM no portal Azure |
| `pg_restore: error: ... already exists` | Schema conflitante na VM | Dropar e recriar o banco `flights` na VM antes de restaurar |
