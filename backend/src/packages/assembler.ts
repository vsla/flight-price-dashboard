import { PrismaClient } from '@prisma/client'
import { createHash } from 'crypto'

export type PackageStrategy = 'roundtrip_bundled' | 'separate_same' | 'open_jaw'

export type PackageTag =
  | 'mais_barato'
  | 'direto'
  | 'melhor_valor'
  | 'open_jaw'
  | 'mesma_cia'
  | 'longa_estadia'

export interface FlightLeg {
  origin: string
  destination: string
  date: string        // YYYY-MM-DD
  airline: string | null
  stops: number
  durationMinutes: number | null
  priceBrl: number
  source: string
}

export interface FlightPackage {
  id: string
  strategy: PackageStrategy
  outbound: FlightLeg
  return: FlightLeg
  totalPriceBrl: number
  stayDays: number
  origin: string
  flyTo: string
  returnFrom: string
  sameAirline: boolean
  score: number
  tags: PackageTag[]
}

export interface ReturnOption {
  id: string
  returnDate: string       // YYYY-MM-DD
  returnFrom: string       // IATA
  totalPriceBrl: number
  stayDays: number
  returnLeg: FlightLeg
  strategy: PackageStrategy
  sameAirline: boolean
  tags: PackageTag[]
}

export interface GroupedPackage {
  id: string               // hash(departureDate|flyTo)
  departureDate: string    // YYYY-MM-DD
  flyTo: string
  origin: string
  outbound: FlightLeg
  cheapestPrice: number
  returnOptions: ReturnOption[]
  tags: PackageTag[]
}

export interface PackageFilters {
  destinations?: string[]
  minStayDays?: number
  maxStayDays?: number
  departAfter?: Date
  departBefore?: Date
  returnBefore?: Date
  maxStops?: number
  maxPriceBrl?: number
  sameAirline?: boolean
  sortBy?: 'price' | 'score' | 'stayDays'
  groupByDeparture?: boolean
  limit?: number
  offset?: number
}

interface RawSnapshot {
  id: number
  routeId: number
  flightDate: Date
  returnDate: Date | null
  airline: string | null
  priceBrl: number
  stops: number
  durationMinutes: number | null
  source: string
  origin: string
  destination: string
  tripType: string
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function packageId(...parts: string[]): string {
  return createHash('md5').update(parts.join('|')).digest('hex').slice(0, 12)
}

function scorePackage(
  pkg: Omit<FlightPackage, 'score' | 'tags'>,
  allPrices: number[],
  now: Date
): number {
  let score = 0

  // Percentil de preço (40 pts) — preço mais baixo = 40
  if (allPrices.length > 1) {
    const min = Math.min(...allPrices)
    const max = Math.max(...allPrices)
    const range = max - min
    if (range > 0) {
      score += Math.round(((max - pkg.totalPriceBrl) / range) * 40)
    } else {
      score += 40
    }
  } else {
    score += 40
  }

  // Voo direto (20 pts)
  if (pkg.outbound.stops === 0 && pkg.return.stops === 0) score += 20
  else if (pkg.outbound.stops === 0 || pkg.return.stops === 0) score += 8

  // Estadia ideal 20-30 dias (15 pts)
  if (pkg.stayDays >= 20 && pkg.stayDays <= 30) score += 15
  else if (pkg.stayDays >= 15 && pkg.stayDays <= 40) score += 8

  // Dados recentes (10 pts) — não temos collectedAt aqui, assume recente
  score += 10

  // Mesma companhia (15 pts)
  if (pkg.sameAirline) score += 15

  return Math.min(100, Math.max(0, score))
}

function assignTags(
  packages: FlightPackage[],
): void {
  if (packages.length === 0) return

  const sorted = [...packages].sort((a, b) => a.totalPriceBrl - b.totalPriceBrl)
  const top3Cheap = new Set(sorted.slice(0, 3).map((p) => p.id))

  const sortedScore = [...packages].sort((a, b) => b.score - a.score)
  const top3Score = new Set(sortedScore.slice(0, 3).map((p) => p.id))

  for (const pkg of packages) {
    const tags: PackageTag[] = []
    if (top3Cheap.has(pkg.id)) tags.push('mais_barato')
    if (top3Score.has(pkg.id)) tags.push('melhor_valor')
    if (pkg.outbound.stops === 0 && pkg.return.stops === 0) tags.push('direto')
    if (pkg.returnFrom !== pkg.flyTo) tags.push('open_jaw')
    if (pkg.sameAirline) tags.push('mesma_cia')
    if (pkg.stayDays >= 25) tags.push('longa_estadia')
    pkg.tags = tags
  }
}

// Deduplica: pega o snapshot mais recente por (routeId, flightDate, returnDate)
function deduplicateSnapshots(snapshots: RawSnapshot[]): RawSnapshot[] {
  const map = new Map<string, RawSnapshot>()
  for (const s of snapshots) {
    const key = `${s.routeId}|${toDateStr(s.flightDate)}|${s.returnDate ? toDateStr(s.returnDate) : 'null'}`
    if (!map.has(key)) map.set(key, s)
  }
  return Array.from(map.values())
}

// Após ordenação, mantém apenas o melhor pacote por (data saída, destino)
function applyGroupByDeparture(packages: FlightPackage[]): FlightPackage[] {
  const seen = new Set<string>()
  const result: FlightPackage[] = []
  for (const pkg of packages) {
    const key = `${pkg.outbound.date}|${pkg.flyTo}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(pkg)
    }
  }
  return result
}

export async function assemblePackages(
  prisma: PrismaClient,
  filters: PackageFilters = {}
): Promise<{ packages: FlightPackage[]; meta: { total: number; cheapest: number | null; lastCollected: string | null } }> {
  const {
    destinations = ['LIS', 'MAD'],
    minStayDays = 5,
    maxStayDays = 60,
    departAfter,
    departBefore,
    returnBefore,
    maxStops,
    maxPriceBrl,
    sameAirline,
    sortBy = 'score',
    groupByDeparture = false,
    limit = 50,
    offset = 0,
  } = filters

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const outboundDateFilter: { gte: Date; lte?: Date } = {
    gte: departAfter ?? today,
    ...(departBefore ? { lte: departBefore } : {}),
  }

  // Outbound legs + roundtrip bundled: filter by departure date
  // Return legs: fetch separately without the departure date cap so they aren't excluded
  const [outboundRaw, returnRaw] = await Promise.all([
    prisma.priceSnapshot.findMany({
      where: {
        route: { isActive: true, origin: 'REC' },
        flightDate: outboundDateFilter,
        priceBrl: { not: null, gt: 0 },
      },
      include: { route: true },
      orderBy: { collectedAt: 'desc' },
    }),
    prisma.priceSnapshot.findMany({
      where: {
        route: { isActive: true, destination: 'REC', tripType: 'oneway' },
        flightDate: { gte: departAfter ?? today },
        priceBrl: { not: null, gt: 0 },
      },
      include: { route: true },
      orderBy: { collectedAt: 'desc' },
    }),
  ])

  const rawData = [...outboundRaw, ...returnRaw]
  const lastCollected = outboundRaw[0]?.collectedAt?.toISOString() ?? null

  // Mapear para RawSnapshot
  type RawDataItem = (typeof rawData)[0]
  const snapshots: RawSnapshot[] = rawData.map((s: RawDataItem) => ({
    id: s.id,
    routeId: s.routeId,
    flightDate: s.flightDate,
    returnDate: s.returnDate,
    airline: s.airline,
    priceBrl: Number(s.priceBrl),
    stops: s.stops,
    durationMinutes: s.durationMinutes,
    source: s.source,
    origin: s.route.origin,
    destination: s.route.destination,
    tripType: s.route.tripType,
  }))

  const deduped = deduplicateSnapshots(snapshots)

  const packages: FlightPackage[] = []

  // ── ESTRATÉGIA 1: Roundtrip bundled ─────────────────────────────────────
  const bundled = deduped.filter(
    (s) =>
      s.tripType === 'roundtrip' &&
      s.returnDate !== null &&
      s.origin === 'REC' &&
      destinations.includes(s.destination)
  )

  for (const s of bundled) {
    const stay = daysBetween(s.flightDate, s.returnDate!)
    if (stay < minStayDays || stay > maxStayDays) continue
    if (maxStops !== undefined && s.stops > maxStops) continue
    if (returnBefore && s.returnDate! > returnBefore) continue

    const leg: FlightLeg = {
      origin: s.origin,
      destination: s.destination,
      date: toDateStr(s.flightDate),
      airline: s.airline,
      stops: s.stops,
      durationMinutes: s.durationMinutes,
      priceBrl: s.priceBrl,
      source: s.source,
    }
    const retLeg: FlightLeg = {
      origin: s.destination,
      destination: 'REC',
      date: toDateStr(s.returnDate!),
      airline: s.airline,
      stops: s.stops,
      durationMinutes: s.durationMinutes,
      priceBrl: 0,
      source: s.source,
    }

    packages.push({
      id: packageId('bundled', String(s.id)),
      strategy: 'roundtrip_bundled',
      outbound: leg,
      return: retLeg,
      totalPriceBrl: s.priceBrl,
      stayDays: stay,
      origin: 'REC',
      flyTo: s.destination,
      returnFrom: s.destination,
      sameAirline: true,
      score: 0,
      tags: [],
    })
  }

  // ── ESTRATÉGIAS 2 & 3: Tickets separados + Open Jaw ─────────────────────
  const outbounds = deduped.filter(
    (s) =>
      s.tripType === 'oneway' &&
      s.origin === 'REC' &&
      destinations.includes(s.destination)
  )

  const returns = deduped.filter(
    (s) =>
      s.tripType === 'oneway' &&
      s.destination === 'REC' &&
      destinations.includes(s.origin)
  )

  for (const out of outbounds) {
    if (maxStops !== undefined && out.stops > maxStops) continue
    if (departAfter && out.flightDate < departAfter) continue
    if (departBefore && out.flightDate > departBefore) continue

    for (const ret of returns) {
      if (maxStops !== undefined && ret.stops > maxStops) continue

      if (ret.flightDate <= out.flightDate) continue

      const stay = daysBetween(out.flightDate, ret.flightDate)
      if (stay < minStayDays || stay > maxStayDays) continue
      if (returnBefore && ret.flightDate > returnBefore) continue

      const isSameAirport = out.destination === ret.origin
      const strategy: PackageStrategy = isSameAirport ? 'separate_same' : 'open_jaw'

      const isSameAirline =
        !!out.airline && !!ret.airline && out.airline === ret.airline

      if (sameAirline === true && !isSameAirline) continue
      if (sameAirline === false && isSameAirline) continue

      const total = out.priceBrl + ret.priceBrl

      packages.push({
        id: packageId(strategy, String(out.id), String(ret.id)),
        strategy,
        outbound: {
          origin: out.origin,
          destination: out.destination,
          date: toDateStr(out.flightDate),
          airline: out.airline,
          stops: out.stops,
          durationMinutes: out.durationMinutes,
          priceBrl: out.priceBrl,
          source: out.source,
        },
        return: {
          origin: ret.origin,
          destination: ret.destination,
          date: toDateStr(ret.flightDate),
          airline: ret.airline,
          stops: ret.stops,
          durationMinutes: ret.durationMinutes,
          priceBrl: ret.priceBrl,
          source: ret.source,
        },
        totalPriceBrl: total,
        stayDays: stay,
        origin: 'REC',
        flyTo: out.destination,
        returnFrom: ret.origin,
        sameAirline: isSameAirline,
        score: 0,
        tags: [],
      })
    }
  }

  // Scoring
  const allPrices = packages.map((p) => p.totalPriceBrl)
  for (const pkg of packages) {
    pkg.score = scorePackage(pkg, allPrices, today)
  }

  // Tags
  assignTags(packages)

  // Sort
  packages.sort((a, b) => {
    if (sortBy === 'price') return a.totalPriceBrl - b.totalPriceBrl
    if (sortBy === 'stayDays') return b.stayDays - a.stayDays
    return b.score - a.score
  })

  // Filtro de preço máximo
  const priceFiltered = maxPriceBrl
    ? packages.filter((p) => p.totalPriceBrl <= maxPriceBrl)
    : packages

  // Agrupamento: 1 card por (data saída, destino), mantendo o melhor pela ordenação atual
  const grouped = groupByDeparture
    ? applyGroupByDeparture(priceFiltered)
    : priceFiltered

  const total = grouped.length
  const cheapestPrice = priceFiltered.length > 0 ? Math.min(...priceFiltered.map((p) => p.totalPriceBrl)) : null
  const page = grouped.slice(offset, offset + limit)

  return {
    packages: page,
    meta: {
      total,
      cheapest: cheapestPrice,
      lastCollected,
    },
  }
}

export async function assembleGroupedPackages(
  prisma: PrismaClient,
  filters: PackageFilters = {}
): Promise<{ groups: GroupedPackage[]; meta: { total: number; cheapest: number | null; lastCollected: string | null } }> {
  const { sortBy = 'score', maxPriceBrl, limit = 15, offset = 0 } = filters

  // Reutiliza toda a lógica de montagem de pacotes flat
  const { packages: allPackages, meta } = await assemblePackages(prisma, {
    ...filters,
    groupByDeparture: false,
    limit: 999999,
    offset: 0,
  })

  // Agrupa por (departureDate, flyTo)
  const groupMap = new Map<string, FlightPackage[]>()
  for (const pkg of allPackages) {
    const key = `${pkg.outbound.date}|${pkg.flyTo}`
    const existing = groupMap.get(key)
    if (existing) existing.push(pkg)
    else groupMap.set(key, [pkg])
  }

  // Converte cada grupo em GroupedPackage
  const groups: GroupedPackage[] = []
  for (const [key, pkgs] of groupMap) {
    // Ordena opções de volta por preço
    pkgs.sort((a, b) => a.totalPriceBrl - b.totalPriceBrl)

    const cheapest = pkgs[0]
    if (maxPriceBrl && cheapest.totalPriceBrl > maxPriceBrl) continue

    const returnOptions: ReturnOption[] = pkgs.map((pkg) => ({
      id: pkg.id,
      returnDate: pkg.return.date,
      returnFrom: pkg.returnFrom,
      totalPriceBrl: pkg.totalPriceBrl,
      stayDays: pkg.stayDays,
      returnLeg: pkg.return,
      strategy: pkg.strategy,
      sameAirline: pkg.sameAirline,
      tags: pkg.tags,
    }))

    groups.push({
      id: packageId(key),
      departureDate: cheapest.outbound.date,
      flyTo: cheapest.flyTo,
      origin: cheapest.origin,
      outbound: cheapest.outbound,
      cheapestPrice: cheapest.totalPriceBrl,
      returnOptions,
      tags: cheapest.tags,
    })
  }

  // Ordena grupos
  groups.sort((a, b) => {
    if (sortBy === 'price') return a.cheapestPrice - b.cheapestPrice
    if (sortBy === 'stayDays') {
      const aMax = Math.max(...a.returnOptions.map((r) => r.stayDays))
      const bMax = Math.max(...b.returnOptions.map((r) => r.stayDays))
      return bMax - aMax
    }
    // score: ordena por data de saída (mais próxima primeiro) como proxy de relevância
    return a.departureDate.localeCompare(b.departureDate)
  })

  const total = groups.length
  const cheapestOverall = groups.length > 0 ? groups[0].cheapestPrice : null
  const page = groups.slice(offset, offset + limit)

  return {
    groups: page,
    meta: {
      total,
      cheapest: cheapestOverall ?? meta.cheapest,
      lastCollected: meta.lastCollected,
    },
  }
}
