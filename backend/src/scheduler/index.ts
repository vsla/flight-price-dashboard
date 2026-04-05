import { PrismaClient } from '@prisma/client'
import * as aviasales from '../collectors/aviasales'
import * as amadeus from '../collectors/amadeus'
import * as serpapi from '../collectors/serpapi'
import { FlightRecord } from '../collectors/types'

const MONTHS_AHEAD = 12

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

function toYearMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

// Merge por flight_date: mantém o mais barato de cada data
function mergeByDate(records: FlightRecord[]): FlightRecord[] {
  const map = new Map<string, FlightRecord>()
  for (const r of records) {
    const key = r.flightDate.toISOString().slice(0, 10)
    const existing = map.get(key)
    if (!existing || r.priceBrl < existing.priceBrl) {
      map.set(key, r)
    }
  }
  return Array.from(map.values())
}

export async function runDailyFetch(prisma: PrismaClient): Promise<number>
export async function runDailyFetch(prisma: PrismaClient, routeId?: number): Promise<number>
export async function runDailyFetch(prisma: PrismaClient, routeId?: number): Promise<number> {
  const where = routeId
    ? { isActive: true, id: routeId }
    : { isActive: true }

  const routes = await prisma.route.findMany({ where })
  const collectedAt = new Date()
  let totalSaved = 0

  for (const route of routes) {
    console.log(`[Scheduler] Coletando ${route.origin}→${route.destination} (${route.tripType})`)

    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const targetDate = addMonths(new Date(), i)
      const yearMonth = toYearMonth(targetDate)

      let records: FlightRecord[] = []

      // Aviasales calendar sempre útil (oneway ou como proxy de datas para roundtrip)
      const aviasalesOneway = await aviasales.fetchMonthCalendar(
        route.origin, route.destination, yearMonth
      )

      if (route.tripType === 'oneway') {
        // Primário: Aviasales calendar
        records = aviasalesOneway.length > 0
          ? aviasalesOneway
          : await amadeus.fetchMonthSample(route.origin, route.destination, yearMonth) // fallback

        // Merge: mantém mais barato por data
        records = mergeByDate(records)

        // Validação Amadeus: valida apenas o dia mais barato do mês (economiza cota)
        if (records.length > 0 && amadeus.isConfigured()) {
          const cheapest = records.reduce((a, b) => a.priceBrl < b.priceBrl ? a : b)
          const dateStr = cheapest.flightDate.toISOString().slice(0, 10)
          const validated = await amadeus.fetchFlightOffers(route.origin, route.destination, dateStr, 1)
          if (validated.length > 0) {
            records = mergeByDate([...records, ...validated])
          }
        }
      } else {
        // Roundtrip — Aviasales não tem calendário de round-trip
        // SerpAPI: nas 5 datas mais baratas (economiza quota)
        if (serpapi.isConfigured() && aviasalesOneway.length > 0) {
          const top5 = [...aviasalesOneway]
            .sort((a, b) => a.priceBrl - b.priceBrl)
            .slice(0, 5)

          for (const proxy of top5) {
            const rtRecords = await serpapi.fetchRoundtrip(
              route.origin, route.destination, proxy.flightDate
            )
            records.push(...rtRecords)
            await new Promise((r) => setTimeout(r, 300))
          }
        }

        // Amadeus como fallback/complemento para roundtrips
        if (amadeus.isConfigured()) {
          const top5 = [...aviasalesOneway]
            .sort((a, b) => a.priceBrl - b.priceBrl)
            .slice(0, 5)

          for (const flight of top5) {
            const dateStr = flight.flightDate.toISOString().slice(0, 10)
            const rtRecords = await amadeus.fetchFlightOffers(
              route.origin, route.destination, dateStr, 3
            )
            records.push(...rtRecords)
            await new Promise((r) => setTimeout(r, 200))
          }
        }

        // Merge: mantém mais barato por (date, returnDate)
        records = mergeByDate(records)
      }

      // Salvar snapshots
      const validRecords = records.filter((r) => r.priceBrl > 0)
      if (validRecords.length > 0) {
        await prisma.priceSnapshot.createMany({
          data: validRecords.map((r) => ({
            collectedAt,
            routeId: route.id,
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
        totalSaved += validRecords.length
        console.log(`  [${yearMonth}] ${validRecords.length} snapshots salvos`)
      }

      await new Promise((r) => setTimeout(r, 500)) // rate limit entre meses
    }
  }

  console.log(`[Scheduler] Coleta concluída: ${totalSaved} snapshots no total`)
  return totalSaved
}
