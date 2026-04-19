'use client'

import Link from 'next/link'
import { useState } from 'react'
import { LayoutDashboard, PlaneTakeoff, SlidersHorizontal } from 'lucide-react'
import { SearchPanel } from '@/components/SearchPanel'
import { FilterSidebar } from '@/components/FilterSidebar'
import { PackageList } from '@/components/PackageList'
import { usePersistedFilters, useInfinitePackages } from '@/lib/hooks'
import { triggerCollect } from '@/lib/api'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export default function Home() {
  const { filters, setFilters, hydrated } = usePersistedFilters()
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfinitePackages(filters, hydrated)
  const [isCollecting, setIsCollecting] = useState(false)

  async function handleCollect() {
    setIsCollecting(true)
    try {
      await triggerCollect()
    } catch {
      // Silencioso — backend pode não estar disponível
    } finally {
      setTimeout(() => setIsCollecting(false), 2000)
    }
  }

  const packages = data?.pages.flatMap((p) => p.groups) ?? []
  const meta = data?.pages[0]?.meta ?? { total: 0, cheapest: null, lastCollected: null }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar */}
      <header className="bg-white border-b border-border sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <PlaneTakeoff className="w-5 h-5 text-primary" />
          <span className="font-bold text-foreground tracking-tight">FlightSearch</span>
          <span className="text-muted-foreground text-sm hidden sm:block">Recife → Europa</span>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Coleta</span>
            </Link>
            {/* Filtros mobile (trigger) */}
            <div className="md:hidden">
              <Sheet>
              <SheetTrigger
                render={<Button variant="outline" size="sm" className="gap-2" />}
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtros
              </SheetTrigger>
              <SheetContent side="left" className="w-72 pt-8">
                <FilterSidebar
                  filters={filters}
                  onChange={setFilters}
                  totalResults={meta.total}
                />
              </SheetContent>
            </Sheet>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 flex flex-col gap-6">
        {/* Search Panel */}
        <SearchPanel
          filters={filters}
          onChange={setFilters}
          onCollect={handleCollect}
          isCollecting={isCollecting}
          lastCollected={meta.lastCollected}
        />

        {/* Layout: sidebar + resultados */}
        <div className="flex gap-6 items-start">
          {/* Sidebar — desktop only */}
          <aside className="hidden md:block w-52 shrink-0 bg-white rounded-2xl border border-border shadow-sm p-4 sticky top-20">
            <FilterSidebar
              filters={filters}
              onChange={setFilters}
              totalResults={meta.total}
            />
          </aside>

          {/* Lista de pacotes */}
          <div className="flex-1 min-w-0">
            <PackageList
              packages={packages}
              isLoading={!hydrated || isLoading}
              isError={isError}
              total={meta.total}
              cheapest={meta.cheapest}
              hasMore={hasNextPage ?? false}
              isFetchingMore={isFetchingNextPage}
              onLoadMore={fetchNextPage}
            />
          </div>
        </div>
      </main>

      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        Dados coletados diariamente · Confirme preços no Google Flights antes de comprar
      </footer>
    </div>
  )
}
