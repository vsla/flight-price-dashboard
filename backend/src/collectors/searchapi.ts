/**
 * SearchAPI — Google Flights Calendar
 * Registro: https://searchapi.io/
 * Free tier: 100 queries/mês
 * Usado para obter preços de TODOS os dias de um intervalo em uma única chamada.
 */
import axios from 'axios'
import { FlightRecord } from './types'

const BASE_URL = 'https://www.searchapi.io/api/v1/search'

export interface FetchCalendarResult {
  records: FlightRecord[]
  /** Mensagem curta quando a API falha (para relatório de coleta) */
  error?: string
}

function axiosBriefMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as { error?: string } | undefined
    if (body?.error) return body.error
    if (err.response?.status) return `HTTP ${err.response.status} ${err.response.statusText ?? ''}`.trim()
    return err.message
  }
  if (err instanceof Error) return err.message
  return String(err)
}

export function isConfigured(): boolean {
  return !!process.env.SEARCHAPI_KEY
}

interface CalendarEntry {
  departure: string   // YYYY-MM-DD
  price?: number
}

interface CalendarResponse {
  calendar?: CalendarEntry[]
}

/**
 * Busca preços para todos os dias de um intervalo de datas.
 * Uma única chamada retorna até 200 datas — cobertura de ~2 meses.
 */
export async function fetchCalendar(
  origin: string,
  destination: string,
  dateStart: string, // YYYY-MM-DD
  dateEnd: string    // YYYY-MM-DD
): Promise<FetchCalendarResult> {
  if (!isConfigured()) return { records: [] }

  try {
    const response = await axios.get<CalendarResponse>(BASE_URL, {
      params: {
        engine: 'google_flights_calendar',
        departure_id: origin,
        arrival_id: destination,
        outbound_date: dateStart,       // obrigatório — base date
        outbound_date_start: dateStart,
        outbound_date_end: dateEnd,
        return_date: dateEnd,           // obrigatório pela API mesmo para one-way
        return_date_start: dateEnd,     // fixar start = end para forçar 1 dia de retorno
        return_date_end: dateEnd,       // evita auto-expansão (outbound_days × 1 ≤ 200)
        type: '2',              // 2 = one-way
        flight_type: 'one_way', // reforço explícito
        currency: 'BRL',
        hl: 'pt',
        gl: 'br',
        api_key: process.env.SEARCHAPI_KEY,
      },
      timeout: 60000,
    })

    const calendar = response.data.calendar
    if (!calendar || calendar.length === 0) return { records: [] }

    const records = calendar
      .filter((entry) => entry.price && entry.price > 0 && entry.departure)
      .map((entry) => ({
        flightDate: new Date(entry.departure + 'T00:00:00'),
        returnDate: null,
        airline: null,       // calendar view não inclui cia aérea
        priceBrl: entry.price!,
        priceEur: null,
        stops: 0,            // calendar view não inclui escala
        durationMinutes: null,
        source: 'searchapi' as const,
      }))
    return { records }
  } catch (err) {
    const brief = axiosBriefMessage(err)
    console.error(
      `[SearchAPI] Erro calendar ${origin}→${destination} ${dateStart}~${dateEnd}: ${brief}`
    )
    return { records: [], error: brief }
  }
}
