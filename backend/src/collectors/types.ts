export interface FlightRecord {
  flightDate: Date
  returnDate: Date | null
  airline: string | null
  priceBrl: number
  priceEur: number | null
  stops: number
  durationMinutes: number | null
  source: 'aviasales' | 'amadeus' | 'serpapi'
}
