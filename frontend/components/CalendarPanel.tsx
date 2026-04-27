'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarDay } from '@/lib/types'

interface CalendarPanelProps {
  calendarDays: CalendarDay[]
  selectedDay: string | null
  selectedMonths: string[]
  onDayClick: (date: string) => void
  onMonthClick: (ym: string) => void
}

type PriceTier = 'vc' | 'c' | 'm' | 'p' | 'vp'

const tierStyles: Record<PriceTier, { bg: string; text: string; numText: string }> = {
  vc: { bg: 'bg-green-700',  text: 'text-white',       numText: 'text-white/70' },
  c:  { bg: 'bg-green-400',  text: 'text-green-900',   numText: 'text-green-900/60' },
  m:  { bg: 'bg-yellow-300', text: 'text-yellow-900',  numText: 'text-yellow-900/60' },
  p:  { bg: 'bg-orange-400', text: 'text-white',       numText: 'text-white/70' },
  vp: { bg: 'bg-red-600',    text: 'text-white',       numText: 'text-white/70' },
}

const WEEK_LABELS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']

function lastDayOfMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function getPriceTier(price: number, p10: number, p35: number, p65: number, p85: number): PriceTier {
  if (price <= p10) return 'vc'
  if (price <= p35) return 'c'
  if (price <= p65) return 'm'
  if (price <= p85) return 'p'
  return 'vp'
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor((p / 100) * sorted.length)
  return sorted[Math.min(idx, sorted.length - 1)]
}

function formatPrice(price: number): string {
  if (price >= 1000) return `${(price / 1000).toFixed(1).replace('.0', '')}k`
  return String(Math.round(price))
}

function formatMonthHeader(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const month = d.toLocaleDateString('pt-BR', { month: 'long' })
  return `${month.charAt(0).toUpperCase() + month.slice(1)} ${y}`
}

function formatCheapest(price: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(price)
}

export function CalendarPanel({
  calendarDays,
  selectedDay,
  selectedMonths,
  onDayClick,
  onMonthClick,
}: CalendarPanelProps) {
  // Build per-date cheapest price (min across destinations)
  const dateMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of calendarDays) {
      const cur = map.get(d.date)
      if (cur === undefined || d.cheapestPrice < cur) map.set(d.date, d.cheapestPrice)
    }
    return map
  }, [calendarDays])

  // Compute price percentiles for color tiers
  const { p10, p35, p65, p85 } = useMemo(() => {
    const prices = [...dateMap.values()].sort((a, b) => a - b)
    if (prices.length === 0) return { p10: 0, p35: 0, p65: 0, p85: 0 }
    return {
      p10: percentile(prices, 10),
      p35: percentile(prices, 35),
      p65: percentile(prices, 65),
      p85: percentile(prices, 85),
    }
  }, [dateMap])

  // Group by month
  const months = useMemo(() => {
    const ymSet = new Set<string>()
    for (const date of dateMap.keys()) ymSet.add(date.slice(0, 7))
    return [...ymSet].sort()
  }, [dateMap])

  return (
    <div className="px-3 py-3 flex flex-col gap-3">
      {months.map((ym) => {
        const [y, m] = ym.split('-').map(Number)
        const daysInMonth = lastDayOfMonth(ym)
        const firstDow = new Date(y, m - 1, 1).getDay()
        // Convert Sunday=0 to Monday-first offset
        const offset = (firstDow + 6) % 7

        const isMonthSelected = selectedMonths.includes(ym)

        // Cheapest price in this month
        let monthMin: number | null = null
        for (let d = 1; d <= daysInMonth; d++) {
          const date = `${ym}-${String(d).padStart(2, '0')}`
          const p = dateMap.get(date)
          if (p !== undefined && (monthMin === null || p < monthMin)) monthMin = p
        }

        const monthMinTier = monthMin !== null
          ? getPriceTier(monthMin, p10, p35, p65, p85)
          : null

        return (
          <div
            key={ym}
            className={cn(
              'bg-white rounded-xl shadow-sm overflow-hidden transition-shadow',
              isMonthSelected && 'ring-2 ring-primary shadow-md',
            )}
          >
            {/* Month header — clickable to filter */}
            <button
              onClick={() => onMonthClick(ym)}
              className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 transition-colors text-left"
            >
              <span className="font-bold text-xs text-foreground">
                {formatMonthHeader(ym)}
              </span>
              {monthMin !== null && (
                <span className={cn(
                  'text-[10px] font-bold',
                  monthMinTier === 'vc' || monthMinTier === 'c' ? 'text-green-700' : 'text-muted-foreground',
                )}>
                  desde {formatCheapest(monthMin)}
                </span>
              )}
            </button>

            {/* Week day labels */}
            <div className="grid grid-cols-7 px-2.5 mb-0.5">
              {WEEK_LABELS.map((l, i) => (
                <div key={i} className="text-center text-[9px] font-semibold text-muted-foreground/60 py-0.5">
                  {l}
                </div>
              ))}
            </div>

            {/* Day grid */}
            <div className="grid grid-cols-7 gap-[3px] px-2.5 pb-2.5">
              {Array.from({ length: offset }).map((_, i) => (
                <div key={`e-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1
                const date = `${ym}-${String(day).padStart(2, '0')}`
                const price = dateMap.get(date)
                const isSelected = selectedDay === date

                if (price === undefined) {
                  return (
                    <div
                      key={day}
                      className="rounded-[4px] py-[3px] text-center bg-muted/30"
                    >
                      <div className="text-[9px] text-muted-foreground/30 leading-none">{day}</div>
                    </div>
                  )
                }

                const tier = getPriceTier(price, p10, p35, p65, p85)
                const { bg, text, numText } = tierStyles[tier]

                return (
                  <button
                    key={day}
                    onClick={() => onDayClick(date)}
                    className={cn(
                      'rounded-[4px] py-[3px] text-center transition-transform hover:scale-110 hover:z-10 hover:shadow-md relative',
                      bg,
                      isSelected && 'ring-2 ring-primary ring-offset-1 scale-105 z-10 shadow-md',
                    )}
                  >
                    <div className={cn('text-[9px] leading-none mb-[2px]', numText)}>{day}</div>
                    <div className={cn('text-[7.5px] font-bold leading-none', text)}>
                      {formatPrice(price)}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap pb-4 px-1">
        <span className="text-[10px] text-muted-foreground font-medium">Preços:</span>
        {[
          { label: 'Muito barato', cls: 'bg-green-700' },
          { label: 'Barato',       cls: 'bg-green-400' },
          { label: 'Médio',        cls: 'bg-yellow-300' },
          { label: 'Caro',         cls: 'bg-orange-400' },
          { label: 'Muito caro',   cls: 'bg-red-600' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div className={cn('w-2.5 h-2.5 rounded-[2px]', item.cls)} />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
