/**
 * Skyscanner Price Calendar — HTTP client (sem browser)
 *
 * Chama o endpoint interno do Skyscanner que a página de calendário mensal usa.
 * Retorna preços diários para a rota em BRL.
 *
 * Configuração:
 *   SKYSCANNER_ENABLED=true
 *   SKYSCANNER_COOKIES=<string completa de cookies copiada do DevTools>
 *
 * Para obter os cookies: abra o Skyscanner no browser, vá em DevTools → Network,
 * clique na requisição para /g/search-intent/v1/pricecalendar e copie o header
 * "cookie" completo. Cole no .env. Renove quando começar a receber HTTP 403.
 */
import { FlightRecord } from './types'

export interface FetchAllDaysResult {
  records: FlightRecord[]
  error?: string
}

const API_URL = 'https://www.skyscanner.com.br/g/search-intent/v1/pricecalendar'

export function isConfigured(): boolean {
  return process.env.SKYSCANNER_ENABLED === 'true' && !!process.env.SKYSCANNER_COOKIES
}

// No-op mantido para compatibilidade com chamadores que ainda chamam closeBrowser()
export async function closeBrowser(): Promise<void> {}

export async function fetchAllDays(
  origin: string,
  destination: string
): Promise<FetchAllDaysResult> {
  const cookies = process.env.SKYSCANNER_COOKIES!
  const label = `${origin}→${destination}`

  const body = JSON.stringify({
    headers: {
      xSkyscannerClient: 'month-view-page',
      xSkyscannerCurrency: 'BRL',
      xSkyscannerLocale: 'pt-BR',
      xSkyscannerMarket: 'BR',
    },
    originRelevantFlightSkyId: origin.toUpperCase(),
    destinationRelevantFlightSkyId: destination.toUpperCase(),
  })

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        accept: '*/*',
        'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'content-type': 'application/json',
        cookie: cookies,
        origin: 'https://www.skyscanner.com.br',
        referer: 'https://www.skyscanner.com.br/',
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
      },
      body,
    })

    if (!res.ok) {
      const msg = `HTTP ${res.status} — atualize SKYSCANNER_COOKIES no .env`
      console.error(`[Skyscanner] ${label}: ${msg}`)
      return { records: [], error: msg }
    }

    const data = await res.json() as {
      flights?: { days?: Array<{ day: string; price: number; group: string }> }
    }
    const days = data?.flights?.days ?? []

    const records: FlightRecord[] = days
      .filter((d) => d.day && d.price > 0)
      .map((d) => ({
        flightDate: new Date(`${d.day}T00:00:00`),
        returnDate: null,
        airline: null,
        priceBrl: d.price,
        priceEur: null,
        stops: 0,
        durationMinutes: null,
        source: 'skyscanner' as const,
      }))

    console.log(`[Skyscanner] ${label}: ${records.length} data(s)`)
    return { records }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[Skyscanner] ${label}: ${msg}`)
    return { records: [], error: msg }
  }
}
