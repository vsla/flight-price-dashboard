'use client'

import { useEffect, useRef } from 'react'
import { GroupedPackageCard } from './PackageCard'
import { GroupedPackage } from '@/lib/types'
import { Plane, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  packages: GroupedPackage[]
  isLoading: boolean
  isError: boolean
  total: number
  cheapest: number | null
  hasMore: boolean
  isFetchingMore: boolean
  onLoadMore: () => void
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col md:flex-row animate-pulse">
      <div className="w-full md:w-[140px] h-[120px] md:h-auto bg-muted shrink-0" />
      <div className="flex flex-col flex-1 p-4 gap-3">
        <div className="flex justify-between">
          <div className="flex gap-2">
            <div className="h-5 w-20 bg-muted rounded-full" />
            <div className="h-5 w-16 bg-muted rounded-full" />
          </div>
          <div className="h-8 w-24 bg-muted rounded-lg" />
        </div>
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-px bg-border" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-px bg-border" />
        <div className="flex justify-between">
          <div className="h-4 w-40 bg-muted rounded" />
          <div className="h-7 w-32 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  )
}

export function PackageList({ packages, isLoading, isError, total, cheapest, hasMore, isFetchingMore, onLoadMore }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          onLoadMore()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, isFetchingMore, onLoadMore])

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <AlertCircle className="w-10 h-10 text-destructive/60" />
        <p className="text-sm font-medium text-foreground">Erro ao carregar pacotes</p>
        <p className="text-xs text-muted-foreground">Verifique se o backend está rodando em localhost:3001</p>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
        <Plane className="w-10 h-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Nenhum pacote encontrado</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Tente ajustar os filtros de estadia ou período de partida. Você também pode coletar dados novos clicando em "Atualizar dados".
        </p>
      </div>
    )
  }

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

  return (
    <div className="flex flex-col gap-3">
      {/* Resumo */}
      <div className="flex items-center justify-between text-sm text-muted-foreground pb-1">
        <span>
          <strong className="text-foreground">{packages.length}</strong>
          {total > packages.length && (
            <span> de <strong className="text-foreground">{total}</strong></span>
          )}{' '}
          pacote{total !== 1 ? 's' : ''}
        </span>
        {cheapest !== null && (
          <span>
            A partir de <strong className="text-primary">{formatCurrency(cheapest)}</strong>
          </span>
        )}
      </div>

      {/* Cards */}
      {packages.map((group) => (
        <GroupedPackageCard key={group.id} group={group} />
      ))}

      {/* Sentinel de infinite scroll */}
      <div ref={sentinelRef} className="h-4" />

      {/* Indicador de carregamento */}
      {isFetchingMore && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!hasMore && packages.length > 0 && packages.length >= 20 && (
        <p className="text-center text-xs text-muted-foreground py-4">
          Todos os {total} pacotes carregados
        </p>
      )}
    </div>
  )
}
