'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Plane, Calendar, Clock, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GroupedPackage, ReturnOption, FlightLeg, DESTINATION_INFO, AIRLINE_NAMES } from '@/lib/types'
import { buildSkyscannerUrl, getUnsplashUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Props {
  group: GroupedPackage
}

const TAG_CONFIG = {
  mais_barato: { label: '★ Mais barato', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  melhor_valor: { label: '☆ Melhor valor', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  direto: { label: '✓ Direto', className: 'bg-green-100 text-green-800 border-green-200' },
  open_jaw: { label: '⇄ Open Jaw', className: 'bg-purple-100 text-purple-800 border-purple-200' },
  mesma_cia: { label: 'Mesma cia.', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  longa_estadia: { label: '🌴 Longa estadia', className: 'bg-teal-100 text-teal-800 border-teal-200' },
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h${m}m` : `${h}h`
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function getAirlineName(code: string | null): string {
  if (!code) return 'Cia. aérea'
  return AIRLINE_NAMES[code] ?? code
}

function OutboundRow({ leg }: { leg: FlightLeg }) {
  const stopsLabel = leg.stops === 0 ? 'Direto' : leg.stops === 1 ? '1 parada' : `${leg.stops} paradas`

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span className="text-xs font-bold text-muted-foreground shrink-0">{leg.origin}</span>
        <div className="flex-1 flex items-center gap-1 min-w-0">
          <div className="flex-1 h-px bg-border" />
          <Plane className="w-3.5 h-3.5 text-primary shrink-0" />
          {leg.stops > 0 && <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />}
          <div className="flex-1 h-px bg-border" />
        </div>
        <span className="text-xs font-bold text-muted-foreground shrink-0">{leg.destination}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
        <span>{getAirlineName(leg.airline)}</span>
        <span>·</span>
        <span>{stopsLabel}</span>
        {leg.durationMinutes && (
          <>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {formatDuration(leg.durationMinutes)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

const INITIAL_SHOWN = 5

function ReturnOptionRow({ option, outbound, isCheapest }: { option: ReturnOption; outbound: FlightLeg; isCheapest: boolean }) {
  const gfOutbound = buildSkyscannerUrl(outbound.origin, outbound.destination, outbound.date)
  const gfReturn = buildSkyscannerUrl(option.returnLeg.origin, option.returnLeg.destination, option.returnDate)
  const returnDestInfo = DESTINATION_INFO[option.returnFrom]

  return (
    <div className={cn(
      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm',
      isCheapest ? 'bg-primary/5 border border-primary/20' : 'hover:bg-muted/50'
    )}>
      {/* Data volta + estadia */}
      <div className="flex flex-col min-w-[110px]">
        <span className="font-medium text-foreground text-xs">
          {isCheapest && <span className="text-primary mr-1">★</span>}
          {formatShortDate(option.returnDate)}
        </span>
        <span className="text-xs text-muted-foreground">
          {option.stayDays} dias{returnDestInfo ? ` em ${returnDestInfo.name}` : ''}
        </span>
      </div>

      {/* Preço */}
      <div className="flex-1 text-right">
        <span className={cn('font-bold', isCheapest ? 'text-primary text-base' : 'text-foreground text-sm')}>
          {formatCurrency(option.totalPriceBrl)}
        </span>
      </div>

      {/* Links */}
      <div className="flex gap-1.5 shrink-0">
        <a
          href={gfOutbound}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
        >
          Ida <ExternalLink className="w-3 h-3" />
        </a>
        <a
          href={gfReturn}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:border-primary hover:text-primary transition-colors"
        >
          Volta <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export function GroupedPackageCard({ group }: Props) {
  const [expanded, setExpanded] = useState(false)
  const destInfo = DESTINATION_INFO[group.flyTo]
  const shown = expanded ? group.returnOptions : group.returnOptions.slice(0, INITIAL_SHOWN)
  const hiddenCount = group.returnOptions.length - INITIAL_SHOWN

  const PRIORITY_TAGS = ['mais_barato', 'melhor_valor', 'direto'] as const
  const priorityTags = group.tags.filter((t) => (PRIORITY_TAGS as readonly string[]).includes(t))

  return (
    <div className={cn(
      'bg-white rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden',
      group.tags.includes('mais_barato') && 'border-amber-200'
    )}>
      <div className="flex flex-col md:flex-row">
        {/* Imagem do destino */}
        <div className="relative w-full md:w-[140px] h-[100px] md:h-auto shrink-0 overflow-hidden">
          <Image
            src={getUnsplashUrl(destInfo?.unsplashId ?? DESTINATION_INFO.LIS.unsplashId, 300, 200)}
            alt={destInfo?.name ?? group.flyTo}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 140px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent md:bg-gradient-to-r" />
          <div className="absolute bottom-2 left-2 md:bottom-auto md:top-2">
            <span className="text-white text-sm font-bold drop-shadow">{destInfo?.name ?? group.flyTo}</span>
          </div>
        </div>

        {/* Conteúdo principal */}
        <div className="flex flex-col flex-1 p-4 min-w-0">
          {/* Header: data + preço + tags */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Calendar className="w-3.5 h-3.5" />
                <span>Saída: <strong className="text-foreground">{formatDate(group.departureDate)}</strong></span>
              </div>
              <div className="flex flex-wrap gap-1">
                {priorityTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className={cn('text-xs px-2 py-0 font-medium', TAG_CONFIG[tag]?.className)}
                  >
                    {TAG_CONFIG[tag]?.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-muted-foreground">a partir de</div>
              <div className="text-2xl font-bold text-primary">{formatCurrency(group.cheapestPrice)}</div>
            </div>
          </div>

          {/* Voo de ida */}
          <OutboundRow leg={group.outbound} />
        </div>
      </div>

      {/* Opções de volta */}
      <div className="border-t border-border/60 px-4 pb-3">
        <div className="pt-2 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {group.returnOptions.length} opç{group.returnOptions.length === 1 ? 'ão' : 'ões'} de volta
        </div>
        <div className="flex flex-col gap-1">
          {shown.map((option, i) => (
            <ReturnOptionRow
              key={option.id}
              option={option}
              outbound={group.outbound}
              isCheapest={i === 0}
            />
          ))}
        </div>

        {hiddenCount > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" /> Mostrar menos</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Ver mais {hiddenCount} opç{hiddenCount === 1 ? 'ão' : 'ões'}</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
