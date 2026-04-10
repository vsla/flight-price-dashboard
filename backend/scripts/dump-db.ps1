# Exporta o banco do Docker (flightsearch_db) para Dumps/ na raiz do repositório.
# Uso (na raiz do repo ou em backend/):
#   pwsh ./backend/scripts/dump-db.ps1
#   pwsh ./backend/scripts/dump-db.ps1 data    # só dados — ideal para Neon + Prisma db push
#   pwsh ./backend/scripts/dump-db.ps1 sql     # SQL completo (schema+dados) — revisar extensões Timescale
#
param(
  [Parameter(Position = 0)]
  [ValidateSet('full', 'data', 'sql')]
  [string]$Mode = 'full'
)

$ErrorActionPreference = 'Stop'

$container = 'flightsearch_db'
$db = 'flights'
$user = 'postgres'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$dumps = Join-Path $repoRoot 'Dumps'
New-Item -ItemType Directory -Force -Path $dumps | Out-Null

$running = docker inspect $container -f '{{.State.Running}}' 2>$null
if ($running -ne 'true') {
  Write-Error "Container '$container' não está rodando. Execute: docker compose up -d"
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

switch ($Mode) {
  'full' {
    $out = Join-Path $dumps "flights-$stamp.dump"
    docker exec $container pg_dump -U $user -d $db -Fc --no-owner --no-acl -f /tmp/flights.dump
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    docker cp "${container}:/tmp/flights.dump" $out
    docker exec $container rm -f /tmp/flights.dump
    Write-Host "Dump custom criado: $out"
    Write-Host "Restaurar (máquina com pg_restore): pg_restore --no-owner --no-acl -d DATABASE_URL $out"
  }
  'data' {
    $out = Join-Path $dumps "flights-data-$stamp.sql"
    docker exec $container pg_dump -U $user -d $db --data-only --no-owner --no-acl -f /tmp/data.sql
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    docker cp "${container}:/tmp/data.sql" $out
    docker exec $container rm -f /tmp/data.sql
    Write-Host "Dump só dados: $out"
    Write-Host "No Neon: 1) prisma db push  2) psql DATABASE_URL -f $out"
  }
  'sql' {
    $out = Join-Path $dumps "flights-full-$stamp.sql"
    docker exec $container pg_dump -U $user -d $db -Fp --no-owner --no-acl -f /tmp/full.sql
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    docker cp "${container}:/tmp/full.sql" $out
    docker exec $container rm -f /tmp/full.sql
    Write-Host "Dump SQL completo: $out"
    Write-Host "Atenção: imagem Timescale pode incluir CREATE EXTENSION; Postgres puro (Neon) pode exigir editar o arquivo."
  }
}
