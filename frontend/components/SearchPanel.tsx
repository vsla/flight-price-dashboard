'use client'

import { PlaneTakeoff, RefreshCw } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { SearchFilters, DESTINATION_INFO } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  filters: SearchFilters
  onChange: (f: Partial<SearchFilters>) => void
  onCollect: () => void
  isCollecting: boolean
  lastCollected: string | null
}

function formatLastCollected(iso: string | null): string {
  if (!iso) return 'Nunca coletado'
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Gera lista de meses dos próximos N meses
function getMonthOptions(n = 15) {
  const months: { label: string; value: string }[] = []
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    months.push({ label, value })
  }
  return months
}

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Último dia do mês de uma data YYYY-MM-DD */
function lastDayOfSameMonth(yyyyMmDd: string): string {
  const [y, m] = yyyyMmDd.split('-').map(Number)
  const last = new Date(y, m, 0)
  return toYmd(last)
}

function todayYmd(): string {
  const d = new Date()
  return toYmd(d)
}

function firstOfMonthYmd(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

export function SearchPanel({ filters, onChange, onCollect, isCollecting, lastCollected }: Props) {
  const months = getMonthOptions()

  function toggleDestination(code: string) {
    const current = filters.destinations
    const next = current.includes(code)
      ? current.filter((d) => d !== code)
      : [...current, code]
    if (next.length === 0) return // precisa pelo menos 1
    onChange({ destinations: next })
  }

  const mode = filters.departureDateMode ?? 'month'

  const startMonthValue = filters.departAfter || months[0].value
  const endMonthValue = filters.departBefore || months[months.length - 1].value

  function switchToExact() {
    onChange({
      departureDateMode: 'exact',
      departAfter: firstOfMonthYmd(startMonthValue),
      departBefore: lastDayOfSameMonth(endMonthValue),
    })
  }

  function switchToMonth() {
    onChange({
      departureDateMode: 'month',
      departAfter: firstOfMonthYmd(startMonthValue),
      departBefore: firstOfMonthYmd(endMonthValue),
    })
  }

  const dateMin = todayYmd()
  const exactFrom = mode === 'exact' && filters.departAfter ? filters.departAfter : startMonthValue
  const exactTo =
    mode === 'exact' && filters.departBefore ? filters.departBefore : lastDayOfSameMonth(endMonthValue)

  return (
    <div className="bg-white border border-border rounded-2xl shadow-sm p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6 md:flex-wrap">

        {/* Origem (fixo) */}
        <div className="flex flex-col gap-1 min-w-[140px]">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">De</span>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PlaneTakeoff className="w-4 h-4 text-primary" />
            Recife (REC)
          </div>
        </div>

        {/* Destinos */}
        <div className="flex flex-col gap-2 min-w-[160px]">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Para</span>
          <div className="flex flex-wrap gap-3">
            {Object.entries(DESTINATION_INFO).map(([code, info]) => (
              <label
                key={code}
                className={cn(
                  'flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-full border text-sm font-medium transition-colors select-none',
                  filters.destinations.includes(code)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-foreground hover:border-primary'
                )}
              >
                <Checkbox
                  checked={filters.destinations.includes(code)}
                  onCheckedChange={() => toggleDestination(code)}
                  className="hidden"
                />
                {info.name} ({code})
              </label>
            ))}
          </div>
        </div>

        {/* Estadia */}
        <div className="flex flex-col gap-2 min-w-[220px] flex-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Estadia: {filters.minStayDays} a {filters.maxStayDays} dias
          </span>
          <Slider
            min={3}
            max={90}
            step={1}
            value={[filters.minStayDays, filters.maxStayDays]}
            onValueChange={(val) => {
              const arr = Array.isArray(val) ? val : [val as number]
              onChange({ minStayDays: arr[0] ?? filters.minStayDays, maxStayDays: arr[1] ?? filters.maxStayDays })
            }}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>3 dias</span>
            <span>90 dias</span>
          </div>
        </div>

        {/* Período de partida */}
        <div className="flex flex-col gap-2 min-w-[260px] flex-1">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ida — partindo entre</span>
          <div className="flex flex-wrap gap-2 mb-1">
            <button
              type="button"
              onClick={() => {
                if (mode !== 'month') switchToMonth()
              }}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                mode === 'month'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              )}
            >
              Por mês
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode !== 'exact') switchToExact()
              }}
              className={cn(
                'text-xs px-2.5 py-1 rounded-md border transition-colors',
                mode === 'exact'
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              )}
            >
              Datas específicas
            </button>
          </div>

          {mode === 'month' ? (
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={startMonthValue}
                onChange={(e) => onChange({ departAfter: e.target.value, departureDateMode: 'month' })}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground text-sm">até</span>
              <select
                value={endMonthValue}
                onChange={(e) => onChange({ departBefore: e.target.value, departureDateMode: 'month' })}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary min-w-0"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  min={dateMin}
                  value={exactFrom}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    const nextTo = exactTo < v ? v : exactTo
                    onChange({ departAfter: v, departBefore: nextTo, departureDateMode: 'exact' })
                  }}
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
                <span className="text-muted-foreground text-sm">até</span>
                <input
                  type="date"
                  min={exactFrom >= dateMin ? exactFrom : dateMin}
                  value={exactTo}
                  onChange={(e) => {
                    const v = e.target.value
                    if (!v) return
                    const nextFrom = v < exactFrom ? v : exactFrom
                    onChange({
                      departAfter: nextFrom,
                      departBefore: v,
                      departureDateMode: 'exact',
                    })
                  }}
                  className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                />
              </div>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Filtra voos de ida com <code className="bg-muted px-0.5 rounded">flight_date</code> neste intervalo
                (inclusive).
              </p>
            </div>
          )}
        </div>

        {/* Botão coletar */}
        <div className="flex flex-col gap-1 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onCollect}
            disabled={isCollecting}
            className="gap-2 text-xs"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isCollecting && 'animate-spin')} />
            {isCollecting ? 'Coletando...' : 'Atualizar dados'}
          </Button>
          <span className="text-xs text-muted-foreground">
            {formatLastCollected(lastCollected)}
          </span>
        </div>
      </div>
    </div>
  )
}
