/**
 * Skyscanner Month View — HTTP client (sem browser)
 *
 * Chama o endpoint monthviewservice que a página de calendário mensal usa.
 * Retorna preços diários para a rota em BRL, com preços mais baixos que o
 * endpoint anual pricecalendar.
 *
 * Configuração:
 *   SKYSCANNER_ENABLED=true
 *   SKYSCANNER_COOKIES=<string completa de cookies copiada do DevTools>
 *   SKYSCANNER_MONTHS_AHEAD=12  (opcional, padrão 12)
 *
 * Para obter os cookies: abra o Skyscanner no browser, vá em DevTools → Network,
 * clique na requisição para /g/monthviewservice e copie o header "cookie" completo.
 * Cole no .env. Renove quando começar a receber HTTP 403.
 */
import { FlightRecord } from './types'

export interface FetchAllDaysResult {
  records: FlightRecord[]
  error?: string
}

const MONTHVIEW_BASE =
  'https://www.skyscanner.com.br/g/monthviewservice/BR/BRL/pt-BR/calendar'

export function isConfigured(): boolean {
  return process.env.SKYSCANNER_ENABLED === 'true' && !!process.env.SKYSCANNER_COOKIES
}

// No-op mantido para compatibilidade com chamadores que ainda chamam closeBrowser()
export async function closeBrowser(): Promise<void> {}

/** Converte "2026-11" → "2611" (formato oym usado nas URLs do Skyscanner) */
export function toOym(yearMonth: string): string {
  const [year, month] = yearMonth.split('-')
  return year.slice(2) + month
}

function monthsToFetch(): string[] {
  const horizon = parseInt(process.env.SKYSCANNER_MONTHS_AHEAD ?? '12', 10)
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < horizon; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    )
  }
  return months
}

interface GridEntry {
  DirectOutboundAvailable?: boolean
  DirectOutbound?: { Price: number }
  IndirectOutbound?: { Price: number }
  Direct?: { Price: number; TraceRefs?: string[] }
  Indirect?: { Price: number; TraceRefs?: string[] }
}

interface MonthViewResponse {
  Outbound?: string
  Traces?: Record<string, string>
  PriceGrids?: { Grid?: GridEntry[][] }
}

// Trace format: "202604270020*D*MAD*REC*20261113*ctbr*AD"
function parseTrace(str: string): { isDirect: boolean; airline: string | null } {
  const parts = str.split('*')
  return {
    isDirect: parts[1] === 'D',
    airline: parts[6] ?? null,
  }
}

export async function fetchMonthView(
  origin: string,
  destination: string,
  yearMonth: string
): Promise<FetchAllDaysResult> {
  const cookies = process.env.SKYSCANNER_COOKIES!
  const label = `${origin}→${destination} ${yearMonth}`
  const oym = toOym(yearMonth)
  const orig = origin.toUpperCase()
  const dest = destination.toUpperCase()

  const url = `${MONTHVIEW_BASE}/${orig}/${dest}/${yearMonth}/?profile=minimalmonthviewgridv2`
  const referer =
    `https://www.skyscanner.com.br/transporte/passagens-aereas/${origin.toLowerCase()}/${destination.toLowerCase()}/` +
    `?adultsv2=1&cabinclass=economy&childrenv2=&ref=home&rtn=0&preferdirects=false` +
    `&outboundaltsenabled=false&inboundaltsenabled=false&oym=${oym}&selectedoday=01`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: '*/*',
        'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7,es;q=0.6',
        cookie: cookies,
        priority: 'u=1, i',
        referer,
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-model': '""',
        'sec-ch-ua-platform': '"macOS"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    })

    if (!res.ok) {
      const msg = `HTTP ${res.status} — atualize SKYSCANNER_COOKIES no .env`
      console.error(`[Skyscanner] ${label}: ${msg}`)
      return { records: [], error: msg }
    }

    const data = (await res.json()) as MonthViewResponse
    const traces = data?.Traces ?? {}
    const grid = data?.PriceGrids?.Grid?.[0] ?? []
    const [year, month] = yearMonth.split('-').map(Number)

    const records: FlightRecord[] = []

    grid.forEach((entry, idx) => {
      const day = idx + 1
      const flightDate = new Date(year, month - 1, day)

      // Pick cheapest available option for the day
      let price: number | null = null
      let stops = 0
      let airline: string | null = null

      if (entry.Direct && entry.Direct.Price > 0) {
        price = entry.Direct.Price
        stops = 0
        const ref = entry.Direct.TraceRefs?.[0]
        if (ref && traces[ref]) airline = parseTrace(traces[ref]).airline
      }

      if (entry.Indirect && entry.Indirect.Price > 0) {
        if (price === null || entry.Indirect.Price < price) {
          price = entry.Indirect.Price
          stops = 1
          const ref = entry.Indirect.TraceRefs?.[0]
          if (ref && traces[ref]) airline = parseTrace(traces[ref]).airline
        }
      }

      if (price === null) return

      records.push({
        flightDate,
        returnDate: null,
        airline,
        priceBrl: price,
        priceEur: null,
        stops,
        durationMinutes: null,
        source: 'skyscanner' as const,
      })
    })

    console.log(`[Skyscanner] ${label}: ${records.length} data(s)`)
    return { records }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Skyscanner] ${label}: ${msg}`)
    return { records: [], error: msg }
  }
}

export async function fetchAllDays(
  origin: string,
  destination: string
): Promise<FetchAllDaysResult> {
  const months = monthsToFetch()
  const allRecords: FlightRecord[] = []
  const errors: string[] = []

  for (let i = 0; i < months.length; i++) {
    const yearMonth = months[i]
    const { records, error } = await fetchMonthView(origin, destination, yearMonth)
    allRecords.push(...records)
    if (error) errors.push(`${yearMonth}: ${error}`)

    if (i < months.length - 1) {
      await new Promise((res) => setTimeout(res, 500 + Math.random() * 500))
    }
  }

  return {
    records: allRecords,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  }
}
