import { PrismaClient } from '@prisma/client'
import * as skyscanner from '../collectors/skyscanner'
import { FlightRecord } from '../collectors/types'

export interface RouteFetchSummary {
  routeId: number
  origin: string
  destination: string
  tripType: string
  durationMs: number
  skipped: boolean
  rowsFetched: number
  chunkErrors: string[]
  snapshotsInserted: number
}

export interface DailyFetchReport {
  collectedAtIso: string
  routeCount: number
  totalSaved: number
  perRoute: RouteFetchSummary[]
  warnings: string[]
}

// Não chamar o Skyscanner se o último snapshot desta rota for mais novo que N dias
const SKYSCANNER_STALE_DAYS = 3

async function isSkyscannerStale(prisma: PrismaClient, routeId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - SKYSCANNER_STALE_DAYS * 24 * 60 * 60 * 1000)
  const recent = await prisma.priceSnapshot.findFirst({
    where: { routeId, source: 'skyscanner', collectedAt: { gte: cutoff } },
    select: { id: true },
  })
  return !recent
}

async function saveSnapshots(
  prisma: PrismaClient,
  records: FlightRecord[],
  routeId: number,
  collectedAt: Date
): Promise<number> {
  const validRecords = records.filter((r) => r.priceBrl > 0)
  if (validRecords.length === 0) return 0

  await prisma.priceSnapshot.deleteMany({ where: { routeId, source: 'skyscanner' } })

  const result = await prisma.priceSnapshot.createMany({
    data: validRecords.map((r) => ({
      collectedAt,
      routeId,
      flightDate: r.flightDate,
      returnDate: r.returnDate,
      airline: r.airline,
      priceBrl: r.priceBrl,
      priceEur: r.priceEur,
      stops: r.stops,
      durationMinutes: r.durationMinutes,
      source: r.source,
    })),
  })

  return result.count
}

export async function runDailyFetch(prisma: PrismaClient): Promise<DailyFetchReport>
export async function runDailyFetch(prisma: PrismaClient, routeId?: number): Promise<DailyFetchReport>
export async function runDailyFetch(prisma: PrismaClient, routeId?: number): Promise<DailyFetchReport> {
  const where = routeId ? { isActive: true, id: routeId } : { isActive: true }

  const routes = await prisma.route.findMany({ where })
  const collectedAt = new Date()
  let totalSaved = 0
  const warnings: string[] = []
  const perRoute: RouteFetchSummary[] = []

  console.log(
    `[Scheduler] Início — ${routes.length} rota(s) ativa(s), collectedAt=${collectedAt.toISOString()}` +
      (routeId != null ? `, filtro routeId=${routeId}` : '')
  )

  if (!skyscanner.isConfigured()) {
    console.warn(
      '[Scheduler] Skyscanner não configurado — defina SKYSCANNER_ENABLED=true e SKYSCANNER_COOKIES no .env'
    )
    return {
      collectedAtIso: collectedAt.toISOString(),
      routeCount: routes.length,
      totalSaved: 0,
      perRoute: [],
      warnings: ['SKYSCANNER_ENABLED ou SKYSCANNER_COOKIES não configurado'],
    }
  }

  for (const route of routes) {
    const routeStarted = Date.now()
    const routeLabel = `${route.origin}→${route.destination}`
    console.log(`[Scheduler] Rota id=${route.id} ${routeLabel} (${route.tripType})`)

    const records: FlightRecord[] = []
    const chunkErrors: string[] = []
    let skipped = false

    const stale = await isSkyscannerStale(prisma, route.id)
    if (!stale) {
      skipped = true
      console.log(`  [Skyscanner] dados frescos, pulando`)
    } else {
      const { records: fetched, error } = await skyscanner.fetchAllDays(route.origin, route.destination)
      if (error) {
        chunkErrors.push(error)
        warnings.push(`[${routeLabel}] Skyscanner ${error}`)
      }
      records.push(...fetched)
    }

    const rowsFetched = records.length
    const saved = skipped ? 0 : await saveSnapshots(prisma, records, route.id, collectedAt)
    totalSaved += saved
    const routeMs = Date.now() - routeStarted

    perRoute.push({
      routeId: route.id,
      origin: route.origin,
      destination: route.destination,
      tripType: route.tripType,
      durationMs: routeMs,
      skipped,
      rowsFetched,
      chunkErrors,
      snapshotsInserted: saved,
    })

    console.log(
      skipped
        ? `  [Scheduler] pulado — rota em ${routeMs}ms`
        : `  [Scheduler] ${saved} snapshot(s) gravado(s), ${rowsFetched} data(s) — rota em ${routeMs}ms`
    )

    // Delay entre rotas (anti-bot)
    if (route !== routes[routes.length - 1]) {
      await new Promise((res) => setTimeout(res, 3000 + Math.random() * 3000))
    }
  }

  console.log(`[Scheduler] Fim — ${totalSaved} snapshot(s) no total`)

  return {
    collectedAtIso: collectedAt.toISOString(),
    routeCount: routes.length,
    totalSaved,
    perRoute,
    warnings,
  }
}
