import axios from 'axios'
import { FlightRecord } from './types'

const AUTH_URL = 'https://api.amadeus.com/v1/security/oauth2/token'
const OFFERS_URL = 'https://api.amadeus.com/v2/shopping/flight-offers'

// Token cache
let cachedToken: string | null = null
let tokenExpiresAt = 0

export function isConfigured(): boolean {
  return !!(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET)
}

async function getToken(): Promise<string | null> {
  if (!isConfigured()) return null

  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt) return cachedToken

  try {
    const response = await axios.post(
      AUTH_URL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.AMADEUS_CLIENT_ID!,
        client_secret: process.env.AMADEUS_CLIENT_SECRET!,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    )
    cachedToken = response.data.access_token
    tokenExpiresAt = now + (response.data.expires_in - 60) * 1000
    return cachedToken
  } catch (err) {
    console.error('[Amadeus] Erro ao obter token:', err)
    return null
  }
}

function parseDuration(iso: string): number {
  // PT14H30M → 870 minutos
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
  if (!match) return 0
  return (parseInt(match[1] || '0') * 60) + parseInt(match[2] || '0')
}

interface FlightOffer {
  price: { grandTotal: string }
  itineraries: Array<{
    duration: string
    segments: Array<{ departure: { at: string } }>
  }>
  validatingAirlineCodes: string[]
}

interface OffersResponse {
  data: FlightOffer[]
}

export async function fetchFlightOffers(
  origin: string,
  destination: string,
  date: string, // YYYY-MM-DD
  max = 5
): Promise<FlightRecord[]> {
  const token = await getToken()
  if (!token) return []

  try {
    const response = await axios.get<OffersResponse>(OFFERS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: date,
        adults: 1,
        max,
        currencyCode: 'BRL',
        nonStop: false,
      },
      timeout: 15000,
    })

    if (!response.data.data?.length) return []

    return response.data.data.map((offer) => {
      const itin = offer.itineraries[0]
      const segments = itin?.segments ?? []
      const departAt = segments[0]?.departure?.at ?? date
      return {
        flightDate: new Date(departAt),
        returnDate: null,
        airline: offer.validatingAirlineCodes?.[0] ?? null,
        priceBrl: parseFloat(offer.price.grandTotal),
        priceEur: null,
        stops: Math.max(0, segments.length - 1),
        durationMinutes: parseDuration(itin?.duration ?? ''),
        source: 'amadeus' as const,
      }
    }).filter((r) => r.priceBrl > 0)
  } catch (err) {
    console.error(`[Amadeus] Erro ao buscar ${origin}→${destination} ${date}:`, err)
    return []
  }
}

// Amostra Segundas + Sextas do mês (igual ao Python)
export async function fetchMonthSample(
  origin: string,
  destination: string,
  yearMonth: string // YYYY-MM
): Promise<FlightRecord[]> {
  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const sampleDates: string[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    const dow = date.getDay() // 0=Dom, 1=Seg, 5=Sex
    if (dow === 1 || dow === 5) {
      sampleDates.push(`${yearMonth}-${String(d).padStart(2, '0')}`)
    }
  }

  const results: FlightRecord[] = []
  for (const date of sampleDates) {
    const records = await fetchFlightOffers(origin, destination, date, 1)
    results.push(...records)
    await new Promise((r) => setTimeout(r, 300)) // rate limit gentil
  }
  return results
}
