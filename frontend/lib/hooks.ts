'use client'

import { useState, useEffect, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { SearchFilters, DEFAULT_FILTERS, GroupedPackagesResponse } from './types'
import { fetchPackages } from './api'

const STORAGE_KEY = 'flightsearch_filters'

export function usePersistedFilters() {
  const [filters, setFiltersState] = useState<SearchFilters>(DEFAULT_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SearchFilters>
        setFiltersState({ ...DEFAULT_FILTERS, ...parsed })
      }
    } catch {
      // ignora erros de localStorage
    }
    setHydrated(true)
  }, [])

  const setFilters = useCallback((updater: Partial<SearchFilters> | ((prev: SearchFilters) => SearchFilters)) => {
    setFiltersState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // ignora erros de localStorage
      }
      return next
    })
  }, [])

  return { filters, setFilters, hydrated }
}

export function useInfinitePackages(filters: SearchFilters, enabled = true) {
  return useInfiniteQuery<GroupedPackagesResponse>({
    queryKey: ['packages', filters],
    queryFn: ({ pageParam }) => fetchPackages(filters, pageParam as number),
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.groups.length, 0)
      return loaded < lastPage.meta.total ? loaded : undefined
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: 2,
  })
}
