import { PrismaClient } from '@prisma/client'
import * as searchapi from '../collectors/searchapi'
import { FlightRecord } from '../collectors/types'

/** Resumo de uma rota — usado no relatório de coleta e no arquivo .log */
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

// Quantos dias à frente cobrir com o SearchAPI calendar (~10 meses).
const CALENDAR_DAYS_AHEAD = 300

// Dias por chunk: 2 chamadas por rota (180 + 120 dias).
const SEARCHAPI_CHUNK_DAYS = 180

// SearchAPI só é chamado se o último snapshot desta rota for mais velho que N dias.
// 12 calls/run × semanal = 48 calls/mês (limite free tier: 100/mês)
const SEARCHAPI_STALE_DAYS = 7

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

// Verifica se o SearchAPI já foi chamado recentemente para esta rota
async function isSearchApiStale(prisma: PrismaClient, routeId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - SEARCHAPI_STALE_DAYS * 24 * 60 * 60 * 1000)
  const recent = await prisma.priceSnapshot.findFirst({
    where: {
      routeId,
      source: 'searchapi',
      collectedAt: { gte: cutoff },
    },
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

  // Substituir dados antigos pelos novos para esta rota
  await prisma.priceSnapshot.deleteMany({ where: { routeId } })

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
  const where = routeId
    ? { isActive: true, id: routeId }
    : { isActive: true }

  const routes = await prisma.route.findMany({ where })
  const collectedAt = new Date()
  let totalSaved = 0
  const warnings: string[] = []
  const perRoute: RouteFetchSummary[] = []

  console.log(
    `[Scheduler] Início — ${routes.length} rota(s) ativa(s), collectedAt=${collectedAt.toISOString()}` +
      (routeId != null ? `, filtro routeId=${routeId}` : '')
  )

  if (!searchapi.isConfigured()) {
    console.error('[Scheduler] SEARCHAPI_KEY não configurada — abortando')
    return {
      collectedAtIso: collectedAt.toISOString(),
      routeCount: routes.length,
      totalSaved: 0,
      perRoute: [],
      warnings: ['SEARCHAPI_KEY não configurada'],
    }
  }

  for (const route of routes) {
    const routeStarted = Date.now()
    const routeLabel = `${route.origin}→${route.destination}`
    console.log(`[Scheduler] Rota id=${route.id} ${routeLabel} (${route.tripType})`)

    const records: FlightRecord[] = []
    const chunkErrors: string[] = []
    let skipped = false

    const stale = await isSearchApiStale(prisma, route.id)
    if (!stale) {
      skipped = true
      console.log(`  [SearchAPI] dados frescos, pulando`)
    } else {
      let dayOffset = 1
      while (dayOffset <= CALENDAR_DAYS_AHEAD) {
        const chunkEnd = Math.min(dayOffset + SEARCHAPI_CHUNK_DAYS - 1, CALENDAR_DAYS_AHEAD)
        const dateStart = toDateStr(addDays(new Date(), dayOffset))
        const dateEnd = toDateStr(addDays(new Date(), chunkEnd))
        const { records: chunk, error } = await searchapi.fetchCalendar(
          route.origin,
          route.destination,
          dateStart,
          dateEnd
        )
        if (error) {
          const line = `${dateStart}~${dateEnd}: ${error}`
          chunkErrors.push(line)
          warnings.push(`[${routeLabel}] SearchAPI ${line}`)
        }
        records.push(...chunk)
        console.log(`  [SearchAPI] chunk ${dateStart}~${dateEnd}: ${chunk.length} datas`)
        dayOffset = chunkEnd + 1
        if (dayOffset <= CALENDAR_DAYS_AHEAD) {
          await new Promise((res) => setTimeout(res, 500))
        }
      }
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

    await new Promise((res) => setTimeout(res, 500))
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
