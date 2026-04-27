'use client'

import { cn } from '@/lib/utils'
import type { GroupedPackage } from '@/lib/types'
import { buildSkyscannerUrl, buildGoogleFlightsUrl } from '@/lib/api'
import { AIRLINE_NAMES } from '@/lib/types'

interface DealCardProps {
  pkg: GroupedPackage
}

const TAG_STYLES: Record<string, string> = {
  mais_barato:   'bg-green-100 text-green-800',
  melhor_valor:  'bg-blue-100 text-blue-800',
  direto:        'bg-green-50 text-green-700 border border-green-200',
  open_jaw:      'bg-purple-50 text-purple-700 border border-purple-200',
  mesma_cia:     'bg-slate-100 text-slate-700',
  longa_estadia: 'bg-teal-50 text-teal-700 border border-teal-200',
}

const TAG_LABELS: Record<string, string> = {
  mais_barato:   '★ Mais barato',
  melhor_valor:  '◆ Melhor valor',
  direto:        '✓ Direto',
  open_jaw:      '⇄ Open jaw',
  mesma_cia:     'Mesma cia.',
  longa_estadia: '🌴 Longa estadia',
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
}

function formatBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDuration(mins: number | null): string {
  if (!mins) return ''
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

export function DealCard({ pkg }: DealCardProps) {
  const cheapestReturn = pkg.returnOptions[0]
  const allTags = [...pkg.tags, ...(cheapestReturn?.tags ?? [])]
  const uniqueTags = [...new Set(allTags)]

  const isBest  = uniqueTags.includes('mais_barato')
  const isValue = uniqueTags.includes('melhor_valor')

  const airlineName = pkg.outbound.airline
    ? (AIRLINE_NAMES[pkg.outbound.airline] ?? pkg.outbound.airline)
    : null

  const stopsLabel = pkg.outbound.stops === 0
    ? 'Direto'
    : `${pkg.outbound.stops} parada${pkg.outbound.stops > 1 ? 's' : ''}`

  const skyscannerUrl = buildSkyscannerUrl(
    pkg.outbound.origin,
    pkg.outbound.destination,
    pkg.outbound.date,
    cheapestReturn?.returnDate,
  )

  const googleUrl = buildGoogleFlightsUrl(
    pkg.outbound.origin,
    pkg.outbound.destination,
    pkg.outbound.date,
    cheapestReturn?.returnDate,
  )

  const returnCount = pkg.returnOptions.length

  return (
    <div
      className={cn(
        'rounded-xl border bg-white flex flex-col overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md',
        isBest  ? 'border-green-500' : isValue ? 'border-blue-400' : 'border-border',
      )}
    >
      {/* Accent bar */}
      <div className={cn(
        'h-[3px]',
        isBest ? 'bg-green-500' : isValue ? 'bg-blue-400' : 'bg-border',
      )} />

      <div className="p-3 flex flex-col gap-2 flex-1">
        {/* Price + top badge */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[22px] font-extrabold text-primary leading-none">
              {formatBrl(pkg.cheapestPrice)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">ida + volta</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            {uniqueTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', TAG_STYLES[tag])}
              >
                {TAG_LABELS[tag]}
              </span>
            ))}
          </div>
        </div>

        {/* Route */}
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-foreground">{pkg.origin}</span>
          <span className="text-muted-foreground text-xs">→</span>
          <span className="font-bold text-sm text-foreground">{pkg.flyTo}</span>
          {pkg.outbound.durationMinutes && (
            <span className="text-[10px] text-muted-foreground ml-auto">
              {formatDuration(pkg.outbound.durationMinutes)}
            </span>
          )}
        </div>

        {/* Dates + duration */}
        {cheapestReturn && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {formatDate(pkg.departureDate)}
            </span>
            <span className="text-muted-foreground text-[10px]">→</span>
            <span className="text-xs font-semibold text-foreground">
              {formatDate(cheapestReturn.returnDate)}
            </span>
            <span className="bg-muted text-foreground text-[10px] font-semibold px-1.5 py-0.5 rounded">
              {cheapestReturn.stayDays} dias
            </span>
            {returnCount > 1 && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                +{returnCount - 1} opção{returnCount > 2 ? 'ões' : ''}
              </span>
            )}
          </div>
        )}

        {/* Stops tag */}
        <div className="flex gap-1 flex-wrap">
          <span className={cn(
            'text-[9px] font-bold px-1.5 py-0.5 rounded-full',
            pkg.outbound.stops === 0
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-muted text-muted-foreground',
          )}>
            {stopsLabel}
          </span>
          {uniqueTags
            .filter((t) => !['mais_barato', 'melhor_valor', 'direto'].includes(t))
            .map((tag) => (
              <span
                key={tag}
                className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full', TAG_STYLES[tag])}
              >
                {TAG_LABELS[tag]}
              </span>
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 pb-3 pt-1 flex items-center justify-between border-t border-border/50 mt-1">
        <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
          {airlineName ?? '—'}
        </span>
        <div className="flex gap-2 shrink-0">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-primary hover:underline"
          >
            Google ↗
          </a>
          <a
            href={skyscannerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-semibold text-primary hover:underline"
          >
            Sky ↗
          </a>
        </div>
      </div>
    </div>
  )
}
