import axios from 'axios'
import { FlightRecord } from './types'

const BASE_URL = 'https://api.travelpayouts.com/v1/prices'

function isConfigured(): boolean {
  return !!process.env.AVIASALES_TOKEN
}

interface CalendarDay {
  price: number
  airline: string
  transfers: number
}

interface CalendarResponse {
  success: boolean
  data: Record<string, CalendarDay>
}

export interface FetchMonthCalendarResult {
  records: FlightRecord[]
  error?: string
}

function briefErr(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function fetchMonthCalendar(
  origin: string,
  destination: string,
  yearMonth: string // YYYY-MM
): Promise<FetchMonthCalendarResult> {
  if (!isConfigured()) return { records: [] }

  try {
    const response = await axios.get<CalendarResponse>(`${BASE_URL}/calendar`, {
      params: {
        origin,
        destination,
        depart_date: yearMonth,
        currency: 'brl',
        show_to_affiliates: false,
        token: process.env.AVIASALES_TOKEN,
      },
      timeout: 15000,
    })

    if (!response.data.success || !response.data.data) return { records: [] }

    const records = Object.entries(response.data.data)
      .map(([dateStr, day]) => ({
        flightDate: new Date(dateStr + 'T00:00:00'),
        returnDate: null,
        airline: day.airline || null,
        priceBrl: day.price,
        priceEur: null,
        stops: day.transfers ?? 0,
        durationMinutes: null,
        source: 'aviasales' as const,
      }))
      .filter((r) => r.priceBrl > 0)
    return { records }
  } catch (err) {
    const msg = briefErr(err)
    console.error(`[Aviasales] Erro ao buscar ${origin}→${destination} ${yearMonth}: ${msg}`)
    return { records: [], error: msg }
  }
}

interface CheapResponse {
  success: boolean
  data: Record<string, Record<string, { depart_date: string; price: number; airline: string; transfers: number }>>
}

export async function fetchCheapPrices(
  origin: string,
  destination: string
): Promise<FlightRecord[]> {
  if (!isConfigured()) return []

  try {
    const response = await axios.get<CheapResponse>(`${BASE_URL}/cheap`, {
      params: {
        origin,
        destination,
        currency: 'brl',
        token: process.env.AVIASALES_TOKEN,
      },
      timeout: 15000,
    })

    if (!response.data.success || !response.data.data) return []

    const destData = response.data.data[destination]
    if (!destData) return []

    return Object.values(destData)
      .map((entry) => ({
        flightDate: new Date(entry.depart_date + 'T00:00:00'),
        returnDate: null,
        airline: entry.airline || null,
        priceBrl: entry.price,
        priceEur: null,
        stops: entry.transfers ?? 0,
        durationMinutes: null,
        source: 'aviasales' as const,
      }))
      .filter((r) => r.priceBrl > 0)
  } catch (err) {
    console.error(`[Aviasales] Erro cheap ${origin}→${destination}:`, err)
    return []
  }
}
