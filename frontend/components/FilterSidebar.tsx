'use client'

import { SlidersHorizontal } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { SearchFilters } from '@/lib/types'
import { cn } from '@/lib/utils'

interface Props {
  filters: SearchFilters
  onChange: (f: Partial<SearchFilters>) => void
  totalResults: number
}

const STOP_OPTIONS = [
  { label: 'Direto', value: 0 },
  { label: 'Até 1 parada', value: 1 },
  { label: 'Qualquer', value: undefined },
]

const SORT_OPTIONS: { label: string; value: SearchFilters['sortBy'] }[] = [
  { label: 'Menor preço', value: 'price' },
  { label: 'Maior estadia', value: 'stayDays' },
]

const AIRLINE_OPTIONS = [
  { label: 'Qualquer combinação', value: undefined },
  { label: 'Mesma companhia', value: true },
  { label: 'Companhias diferentes', value: false },
]

export function FilterSidebar({ filters, onChange, totalResults }: Props) {
  return (
    <aside className="flex flex-col gap-5 w-full">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <SlidersHorizontal className="w-4 h-4 text-primary" />
        Filtros
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          {totalResults} pacote{totalResults !== 1 ? 's' : ''}
        </span>
      </div>

      <Separator />

      {/* Ordenar por */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ordenar por</span>
        <div className="flex flex-col gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                'flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded-lg transition-colors',
                filters.sortBy === opt.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <input
                type="radio"
                name="sortBy"
                checked={filters.sortBy === opt.value}
                onChange={() => onChange({ sortBy: opt.value })}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Paradas */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Paradas</span>
        <div className="flex flex-col gap-1.5">
          {STOP_OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={cn(
                'flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded-lg transition-colors',
                filters.maxStops === opt.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <input
                type="radio"
                name="maxStops"
                checked={filters.maxStops === opt.value}
                onChange={() => onChange({ maxStops: opt.value })}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Companhia aérea */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Companhia aérea</span>
        <div className="flex flex-col gap-1.5">
          {AIRLINE_OPTIONS.map((opt) => (
            <label
              key={String(opt.value)}
              className={cn(
                'flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded-lg transition-colors',
                filters.sameAirline === opt.value
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-foreground hover:bg-muted'
              )}
            >
              <input
                type="radio"
                name="sameAirline"
                checked={filters.sameAirline === opt.value}
                onChange={() => onChange({ sameAirline: opt.value })}
                className="accent-primary"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <Separator />

      {/* Preço máximo */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preço máximo</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">R$</span>
          <input
            type="number"
            step={500}
            min={1000}
            placeholder="Sem limite"
            value={filters.maxPriceBrl ?? ''}
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : undefined
              onChange({ maxPriceBrl: val })
            }}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {filters.maxPriceBrl !== undefined && (
          <button
            onClick={() => onChange({ maxPriceBrl: undefined })}
            className="text-xs text-muted-foreground hover:text-foreground text-left"
          >
            Limpar
          </button>
        )}
      </div>
    </aside>
  )
}
