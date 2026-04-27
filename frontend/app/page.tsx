'use client'

import { useState, useMemo } from 'react'
import { NavBar } from '@/components/NavBar'
import { MonthPills } from '@/components/MonthPills'
import { CalendarPanel } from '@/components/CalendarPanel'
import { DealsGrid } from '@/components/DealsGrid'
import { usePersistedFilters, useInfinitePackages, useCalendar } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const DESTINATIONS = ['MAD', 'LIS', 'OPO']

function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0)
  return d.toISOString().slice(0, 10)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function futureStr(months = 12): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export default function Home() {
  const { filters, setFilters, hydrated } = usePersistedFilters()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [mobileView, setMobileView] = useState<'calendar' | 'deals'>('deals')

  const selectedMonths: string[] = filters.selectedMonths ?? []

  // Calendar always shows full 12-month range
  const { data: calData } = useCalendar(
    filters.destinations.length > 0 ? filters.destinations : DESTINATIONS,
    todayStr(),
    futureStr(12),
    filters.minStayDays,
    filters.maxStayDays,
    hydrated,
  )

  const calendarDays = calData?.days ?? []

  // Derive available months from calendar data
  const availableMonths = useMemo(() => {
    const set = new Set<string>()
    for (const d of calendarDays) set.add(d.date.slice(0, 7))
    return [...set].sort()
  }, [calendarDays])

  // Effective date range for deals query
  const { departAfter, departBefore } = useMemo(() => {
    if (selectedDay) {
      return { departAfter: selectedDay, departBefore: selectedDay }
    }
    if (selectedMonths.length > 0) {
      const sorted = [...selectedMonths].sort()
      return {
        departAfter: `${sorted[0]}-01`,
        departBefore: lastDayOfMonth(sorted[sorted.length - 1]),
      }
    }
    return { departAfter: todayStr(), departBefore: futureStr(12) }
  }, [selectedDay, selectedMonths])

  const effectiveFilters = useMemo(() => ({
    ...filters,
    departAfter,
    departBefore,
    destinations: filters.destinations.length > 0 ? filters.destinations : DESTINATIONS,
  }), [filters, departAfter, departBefore])

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePackages(effectiveFilters, hydrated)

  const packages = data?.pages.flatMap((p) => p.groups) ?? []
  const meta = data?.pages[0]?.meta ?? { total: 0, cheapest: null, lastCollected: null }

  // Deals panel header text
  const dealsTitle = useMemo(() => {
    if (selectedDay) {
      const d = new Date(selectedDay + 'T12:00:00')
      return `Pacotes · saindo ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')}`
    }
    if (selectedMonths.length === 1) {
      const [y, m] = selectedMonths[0].split('-').map(Number)
      const name = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })
      return `Pacotes · ${name} ${y}`
    }
    if (selectedMonths.length > 1) {
      return `Pacotes · ${selectedMonths.length} meses selecionados`
    }
    return 'Todos os pacotes'
  }, [selectedDay, selectedMonths])

  const dealsSubtitle = useMemo(() => {
    const destStr = (filters.destinations.length > 0 ? filters.destinations : DESTINATIONS).join(', ')
    const total = meta.total
    return `${total} ${total === 1 ? 'opção' : 'opções'} · ${destStr} · ${filters.minStayDays}–${filters.maxStayDays} dias`
  }, [meta.total, filters])

  function handleDayClick(date: string) {
    setSelectedDay((prev) => (prev === date ? null : date))
  }

  function handleMonthClick(ym: string) {
    setSelectedDay(null)
    const next = selectedMonths.includes(ym)
      ? selectedMonths.filter((m) => m !== ym)
      : [...selectedMonths, ym]
    setFilters({ selectedMonths: next })
  }

  function handleMonthPillChange(months: string[]) {
    setSelectedDay(null)
    setFilters({ selectedMonths: months })
  }

  function toggleDest(dest: string) {
    const cur = filters.destinations.length > 0 ? filters.destinations : DESTINATIONS
    const next = cur.includes(dest)
      ? cur.filter((d) => d !== dest)
      : [...cur, dest]
    setFilters({ destinations: next.length > 0 ? next : DESTINATIONS })
  }

  const activeDests = filters.destinations.length > 0 ? filters.destinations : DESTINATIONS

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <NavBar />

      {/* Controls bar — row 1: destinations + stay + sort */}
      <div className="bg-white border-b border-border shrink-0">
        <div className="px-3 pt-2 pb-1 flex items-center gap-2">
          {/* Destination pills */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="hidden sm:inline text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Destino</span>
            {DESTINATIONS.map((d) => (
              <button
                key={d}
                onClick={() => toggleDest(d)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors',
                  activeDests.includes(d)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-white text-foreground border-border hover:border-primary/50',
                )}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Stay duration */}
          <div className="flex items-center gap-1 shrink-0">
            <input
              type="range" min={3} max={60} value={filters.minStayDays}
              onChange={(e) => setFilters({ minStayDays: Number(e.target.value) })}
              className="w-12 sm:w-16 accent-primary"
            />
            <span className="text-[10px] text-muted-foreground">–</span>
            <input
              type="range" min={3} max={90} value={filters.maxStayDays}
              onChange={(e) => setFilters({ maxStayDays: Number(e.target.value) })}
              className="w-12 sm:w-16 accent-primary"
            />
            <span className="text-[10px] font-bold text-primary whitespace-nowrap ml-0.5">
              {filters.minStayDays}–{filters.maxStayDays}d
            </span>
          </div>

          {/* Sort */}
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ sortBy: e.target.value as 'price' | 'stayDays' })}
            className="text-xs border border-border rounded-md px-1.5 py-1 bg-white text-foreground font-semibold shrink-0"
          >
            <option value="price">R$ ↑</option>
            <option value="stayDays">Dias ↑</option>
          </select>
        </div>

        {/* Row 2: month pills — horizontal scroll */}
        <div className="px-3 pb-2 flex items-center gap-2 overflow-x-auto">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide shrink-0">Mês</span>
          <MonthPills
            availableMonths={availableMonths}
            selectedMonths={selectedMonths}
            onChange={handleMonthPillChange}
          />
        </div>
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden flex shrink-0 border-b border-border bg-white">
        <button
          onClick={() => setMobileView('calendar')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold transition-colors',
            mobileView === 'calendar'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground',
          )}
        >
          Calendário
        </button>
        <button
          onClick={() => setMobileView('deals')}
          className={cn(
            'flex-1 py-2 text-sm font-semibold transition-colors',
            mobileView === 'deals'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground',
          )}
        >
          Pacotes
        </button>
      </div>

      {/* Main split */}
      <div className="flex flex-1 min-h-0 overflow-hidden flex-col md:flex-row">
        {/* Calendar */}
        <div className={cn(
          'w-full overflow-y-auto md:max-h-none md:w-[490px] md:shrink-0 md:block',
          mobileView === 'calendar' ? 'block max-h-[calc(100dvh-8rem)]' : 'hidden',
        )}>
          <CalendarPanel
            calendarDays={calendarDays}
            selectedDay={selectedDay}
            selectedMonths={selectedMonths}
            onDayClick={handleDayClick}
            onMonthClick={handleMonthClick}
          />
        </div>

        {/* Deals grid */}
        <div className={cn('flex-1 min-h-0 min-w-0 overflow-hidden md:block', mobileView === 'deals' ? 'block' : 'hidden')}>
          <DealsGrid
            packages={packages}
            loading={!hydrated || isLoading}
            title={dealsTitle}
            subtitle={dealsSubtitle}
            hasMore={hasNextPage ?? false}
            isFetchingMore={isFetchingNextPage}
            onLoadMore={fetchNextPage}
          />
        </div>
      </div>
    </div>
  )
}
