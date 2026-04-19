'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Database, PlaneTakeoff, RefreshCw } from 'lucide-react'
import { fetchSnapshots } from '@/lib/api'
import type { SnapshotQueryFilters, SnapshotSortOrder } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const inputClass =
  'flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50'

/** Duas ordenações pedidas no dashboard: data do voo mais “nova” no calendário, ou menor preço */
const SORT_OPTIONS: { value: SnapshotSortOrder; label: string }[] = [
  { value: 'flightDate_desc', label: 'Data do voo mais recente' },
  { value: 'priceBrl_asc', label: 'Menor preço' },
]

const defaultFilters: SnapshotQueryFilters = {
  lastCollect: true,
  flightDate: '',
  origin: '',
  destination: '',
  tripType: '',
  order: 'flightDate_desc',
}

function formatBrl(v: string | number | null): string {
  if (v == null) return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DashboardPage() {
  const [draft, setDraft] = useState<SnapshotQueryFilters>(defaultFilters)
  const [applied, setApplied] = useState<SnapshotQueryFilters>(defaultFilters)

  const queryKey = useMemo(
    () => ['snapshots', applied] as const,
    [applied]
  )

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () => fetchSnapshots(applied),
  })

  function applyFilters() {
    setApplied({ ...draft })
  }

  function resetFilters() {
    setDraft(defaultFilters)
    setApplied(defaultFilters)
  }

  const snapshots = data?.snapshots ?? []
  const meta = data?.meta

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Pacotes
          </Link>
          <span className="text-border hidden sm:inline">|</span>
          <PlaneTakeoff className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground tracking-tight">FlightSearch</span>
          <span className="text-muted-foreground text-sm hidden sm:inline">Snapshots da coleta</span>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Database className="w-5 h-5 text-primary" />
                  Dados brutos da coleta
                </CardTitle>
                <CardDescription>
                  Use o checkbox para limitar à <strong className="text-foreground font-medium">coleta mais recente</strong>.
                  Ordene pela data do voo ou pelo menor preço. Filtros opcionais: data do voo, origem e destino IATA.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
                Atualizar
              </Button>
            </div>
            {meta?.lastCollectedAt && (
              <p className="text-xs text-muted-foreground pt-1">
                Último <code className="bg-muted px-1 rounded">collected_at</code> no banco:{' '}
                {formatDateTime(meta.lastCollectedAt)}
              </p>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm shrink-0">
                <Checkbox
                  checked={draft.lastCollect}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, lastCollect: Boolean(v) }))}
                />
                <span className="leading-snug">Somente coleta mais recente</span>
              </label>
              <div className="flex flex-col gap-1.5 min-w-[min(100%,260px)] sm:flex-1 sm:max-w-sm">
                <Label htmlFor="sortOrder">Ordenar por</Label>
                <select
                  id="sortOrder"
                  className={inputClass}
                  value={draft.order}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      order: e.target.value as SnapshotSortOrder,
                    }))
                  }
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="flightDate">Data do voo</Label>
                <input
                  id="flightDate"
                  type="date"
                  className={inputClass}
                  value={draft.flightDate}
                  onChange={(e) => setDraft((d) => ({ ...d, flightDate: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="origin">Origem (IATA)</Label>
                <input
                  id="origin"
                  type="text"
                  placeholder="ex: REC"
                  maxLength={3}
                  className={cn(inputClass, 'uppercase font-mono')}
                  value={draft.origin}
                  onChange={(e) => setDraft((d) => ({ ...d, origin: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="destination">Destino (IATA)</Label>
                <input
                  id="destination"
                  type="text"
                  placeholder="ex: MAD"
                  maxLength={3}
                  className={cn(inputClass, 'uppercase font-mono')}
                  value={draft.destination}
                  onChange={(e) => setDraft((d) => ({ ...d, destination: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tripType">Tipo de rota</Label>
                <select
                  id="tripType"
                  className={inputClass}
                  value={draft.tripType}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      tripType: e.target.value as SnapshotQueryFilters['tripType'],
                    }))
                  }
                >
                  <option value="">Todos</option>
                  <option value="oneway">Só ida (oneway)</option>
                  <option value="roundtrip">Ida e volta (roundtrip)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={applyFilters} disabled={isFetching}>
                Aplicar filtros
              </Button>
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {isLoading ? 'Carregando…' : `${meta?.total ?? 0} registro(s)`}
              {applied.lastCollect && !isLoading && (
                <span className="text-muted-foreground font-normal"> · só coleta mais recente</span>
              )}
              {!isLoading && (
                <span className="text-muted-foreground font-normal">
                  {' '}
                  ·{' '}
                  {applied.order === 'priceBrl_asc' ? 'menor preço' : 'data do voo mais recente'}
                </span>
              )}
            </span>
          </div>

          {isError && (
            <div className="p-6 text-sm text-destructive">
              {error instanceof Error ? error.message : 'Erro ao carregar snapshots. O backend está em execução?'}
            </div>
          )}

          {isLoading && !data && (
            <div className="p-10 text-center text-sm text-muted-foreground">Carregando snapshots…</div>
          )}

          {!isLoading && !isError && snapshots.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum snapshot encontrado para esses filtros.
            </div>
          )}

          {!isLoading && !isError && snapshots.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Coletado em</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Origem</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Destino</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Tipo</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Data voo</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Volta</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap text-right">Preço</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap text-center">Paradas</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Cia</th>
                    <th className="px-3 py-2.5 font-medium whitespace-nowrap">Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-border/80 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                        {formatDateTime(row.collectedAt)}
                      </td>
                      <td className="px-3 py-2 font-mono font-medium">{row.route.origin}</td>
                      <td className="px-3 py-2 font-mono font-medium">{row.route.destination}</td>
                      <td className="px-3 py-2 text-muted-foreground">{row.route.tripType}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.flightDate)}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(row.returnDate)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatBrl(row.priceBrl)}
                      </td>
                      <td className="px-3 py-2 text-center">{row.stops}</td>
                      <td className="px-3 py-2 max-w-[120px] truncate" title={row.airline ?? ''}>
                        {row.airline ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">{row.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Limite de até 10&nbsp;000 linhas por resposta · API{' '}
        <code className="bg-muted px-1 rounded">GET /api/snapshots</code>
      </footer>
    </div>
  )
}
