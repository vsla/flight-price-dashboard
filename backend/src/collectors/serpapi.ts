/**
 * SerpAPI — Google Flights
 * Registro: https://serpapi.com/
 * Free tier: 250 queries/mês (sem cartão de crédito)
 * Usado para round-trips onde Aviasales não tem calendário de preços.
 */
import axios from 'axios'
import { FlightRecord } from './types'

const BASE_URL = 'https://serpapi.com/search.json'

export function isConfigured(): boolean {
  return !!process.env.SERPAPI_KEY
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

interface SerpFlight {
  price?: number
  flights?: Array<{
    airline?: string
    duration?: number
  }>
}

interface SerpResponse {
  best_flights?: SerpFlight[]
  other_flights?: SerpFlight[]
}

/**
 * Busca round-trip para uma data específica de partida.
 * Retorna apenas o voo mais barato encontrado para não desperdiçar quota.
 */
export async function fetchRoundtrip(
  origin: string,
  destination: string,
  departureDate: Date,
  nights = 14
): Promise<FlightRecord[]> {
  if (!isConfigured()) return []

  const returnDate = addDays(departureDate, nights)
  const depStr = departureDate.toISOString().slice(0, 10)
  const retStr = returnDate.toISOString().slice(0, 10)

  try {
    const response = await axios.get<SerpResponse>(BASE_URL, {
      params: {
        engine: 'google_flights',
        departure_id: origin,
        arrival_id: destination,
        outbound_date: depStr,
        return_date: retStr,
        type: '1',        // 1 = round-trip
        currency: 'BRL',
        hl: 'pt',
        gl: 'br',
        api_key: process.env.SERPAPI_KEY,
      },
      timeout: 30000,
    })

    const allFlights = [
      ...(response.data.best_flights ?? []),
      ...(response.data.other_flights ?? []),
    ]

    const candidates: FlightRecord[] = []

    for (const flight of allFlights) {
      const priceBrl = Number(flight.price ?? 0)
      if (priceBrl <= 0) continue

      const legs = flight.flights ?? []
      if (legs.length === 0) continue

      const airline = legs[0]?.airline ?? null
      const durationMinutes = legs.reduce((sum, l) => sum + (l.duration ?? 0), 0)
      const stops = legs.length - 1

      candidates.push({
        flightDate: new Date(depStr + 'T00:00:00'),
        returnDate: new Date(retStr + 'T00:00:00'),
        airline,
        priceBrl,
        priceEur: null,
        stops,
        durationMinutes: durationMinutes > 0 ? durationMinutes : null,
        source: 'serpapi',
      })
    }

    if (candidates.length === 0) return []

    // Retorna apenas o mais barato (economiza quota)
    const cheapest = candidates.reduce((best, c) => c.priceBrl < best.priceBrl ? c : best)
    return [cheapest]
  } catch (err) {
    console.error(`[SerpAPI] Erro roundtrip ${origin}→${destination} ${depStr}:`, err)
    return []
  }
}
