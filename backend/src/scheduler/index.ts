import { PrismaClient } from '@prisma/client'
// import * as searchapi from '../collectors/searchapi'   // v1: substituído pelo Skyscanner scraper
import * as skyscanner from '../collectors/skyscanner'
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

// v1: Skyscanner como fonte de calendário
// Quantos meses à frente cobrir
const SKYSCANNER_MONTHS_AHEAD = 15

// Skyscanner só é chamado se o último snapshot desta rota for mais velho que N dias.
const SKYSCANNER_STALE_DAYS = 3

// v1 comentado (SearchAPI):
// const CALENDAR_DAYS_AHEAD = 300
// const SEARCHAPI_CHUNK_DAYS = 180
// const SEARCHAPI_STALE_DAYS = 7

/**
 * Gera uma lista de meses no formato 'YYYY-MM' a partir do mês atual.
 * Ex: generateMonthRange(new Date('2026-04-10'), 3) → ['2026-04', '2026-05', '2026-06']
 */
function generateMonthRange(from: Date, count: number): string[] {
  const months: string[] = []
  const year = from.getFullYear()
  const month = from.getMonth() // 0-indexed
  for (let i = 0; i < count; i++) {
    const d = new Date(year, month + i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
  }
  return months
}

// Verifica se o Skyscanner já foi chamado recentemente para esta rota
async function isSkyscannerStale(prisma: PrismaClient, routeId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - SKYSCANNER_STALE_DAYS * 24 * 60 * 60 * 1000)
  const recent = await prisma.priceSnapshot.findFirst({
    where: {
      routeId,
      source: 'skyscanner',
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

  // Substituir apenas snapshots desta fonte para esta rota
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

  if (!skyscanner.isConfigured()) {
    console.warn('[Scheduler] SKYSCANNER_ENABLED não está true — adicione ao .env para habilitar coleta')
    return {
      collectedAtIso: collectedAt.toISOString(),
      routeCount: routes.length,
      totalSaved: 0,
      perRoute: [],
      warnings: ['SKYSCANNER_ENABLED não configurado'],
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
      const months = generateMonthRange(new Date(), SKYSCANNER_MONTHS_AHEAD)
      for (let i = 0; i < months.length; i++) {
        const ym = months[i]
        const { records: chunk, error } = await skyscanner.fetchMonthView(
          route.origin,
          route.destination,
          ym
        )
        if (error) {
          const line = `${ym}: ${error}`
          chunkErrors.push(line)
          warnings.push(`[${routeLabel}] Skyscanner ${line}`)
        }
        records.push(...chunk)
        console.log(`  [Skyscanner] ${ym}: ${chunk.length} data(s)`)

        // Delay anti-bot entre meses (exceto após o último)
        if (i < months.length - 1) {
          await new Promise((res) => setTimeout(res, 5000 + Math.random() * 5000))
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

    // Delay entre rotas (anti-bot)
    if (route !== routes[routes.length - 1]) {
      await new Promise((res) => setTimeout(res, 8000 + Math.random() * 7000))
    }
  }

  // Liberar o browser ao fim do run
  await skyscanner.closeBrowser()

  console.log(`[Scheduler] Fim — ${totalSaved} snapshot(s) no total`)

  return {
    collectedAtIso: collectedAt.toISOString(),
    routeCount: routes.length,
    totalSaved,
    perRoute,
    warnings,
  }
}
