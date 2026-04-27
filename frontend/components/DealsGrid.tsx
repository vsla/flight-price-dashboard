'use client'

import { useEffect, useRef } from 'react'
import type { GroupedPackage } from '@/lib/types'
import { DealCard } from '@/components/DealCard'

interface DealsGridProps {
  packages: GroupedPackage[]
  loading: boolean
  title: string
  subtitle: string
  hasMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-white overflow-hidden animate-pulse">
      <div className="h-[3px] bg-muted" />
      <div className="p-3 flex flex-col gap-2">
        <div className="h-7 w-24 bg-muted rounded" />
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-3 w-28 bg-muted rounded" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
      <div className="px-3 pb-3 pt-1 flex justify-between border-t border-border/50 mt-1">
        <div className="h-3 w-16 bg-muted rounded" />
        <div className="h-3 w-20 bg-muted rounded" />
      </div>
    </div>
  )
}

export function DealsGrid({
  packages,
  loading,
  title,
  subtitle,
  hasMore,
  isFetchingMore,
  onLoadMore,
}: DealsGridProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          onLoadMore()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isFetchingMore, onLoadMore])

  return (
    <div className="h-full flex flex-col overflow-hidden border-l border-border bg-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 shrink-0">
        <div className="font-bold text-sm text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading && packages.length === 0 ? (
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
          >
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
            <span className="text-2xl">✈️</span>
            <span>Nenhum pacote encontrado para esse filtro.</span>
          </div>
        ) : (
          <div
            className="grid gap-2.5"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}
          >
            {packages.map((pkg) => (
              <DealCard key={pkg.id} pkg={pkg} />
            ))}
            {isFetchingMore && Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`sk-${i}`} />)}
          </div>
        )}

        <div ref={sentinelRef} className="h-4" />
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/60 text-[10px] text-muted-foreground text-center shrink-0">
        Dados coletados diariamente · confirme no Google Flights antes de comprar
      </div>
    </div>
  )
}
