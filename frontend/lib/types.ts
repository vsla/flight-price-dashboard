export type PackageStrategy = 'roundtrip_bundled' | 'separate_same' | 'open_jaw'

export type PackageTag =
  | 'mais_barato'
  | 'direto'
  | 'melhor_valor'
  | 'open_jaw'
  | 'mesma_cia'
  | 'longa_estadia'

export interface FlightLeg {
  origin: string
  destination: string
  date: string        // YYYY-MM-DD
  airline: string | null
  stops: number
  durationMinutes: number | null
  priceBrl: number
  source: string
}

export interface FlightPackage {
  id: string
  strategy: PackageStrategy
  outbound: FlightLeg
  return: FlightLeg
  totalPriceBrl: number
  stayDays: number
  origin: string
  flyTo: string
  returnFrom: string
  sameAirline: boolean
  score: number
  tags: PackageTag[]
}

export interface PackagesResponse {
  packages: FlightPackage[]
  meta: {
    total: number
    cheapest: number | null
    lastCollected: string | null
  }
}

export interface ReturnOption {
  id: string
  returnDate: string
  returnFrom: string
  totalPriceBrl: number
  stayDays: number
  returnLeg: FlightLeg
  strategy: PackageStrategy
  sameAirline: boolean
  tags: PackageTag[]
}

export interface GroupedPackage {
  id: string
  departureDate: string
  flyTo: string
  origin: string
  outbound: FlightLeg
  cheapestPrice: number
  returnOptions: ReturnOption[]
  tags: PackageTag[]
}

export interface GroupedPackagesResponse {
  groups: GroupedPackage[]
  meta: {
    total: number
    cheapest: number | null
    lastCollected: string | null
  }
}

export interface SearchFilters {
  destinations: string[]
  minStayDays: number
  maxStayDays: number
  departAfter: string  // YYYY-MM-DD
  departBefore: string // YYYY-MM-DD
  /** Por mês (primeiro do mês) ou intervalo com datas exatas */
  departureDateMode: 'month' | 'exact'
  maxStops: number | undefined
  maxPriceBrl: number | undefined
  sameAirline: boolean | undefined
  sortBy: 'price' | 'stayDays'
  /** Meses selecionados no filtro (YYYY-MM), vazio = todos */
  selectedMonths: string[]
}

export const DEFAULT_FILTERS: SearchFilters = {
  destinations: ['LIS', 'MAD'],
  minStayDays: 15,
  maxStayDays: 30,
  departAfter: '',
  departBefore: '',
  departureDateMode: 'month',
  maxStops: undefined,
  maxPriceBrl: undefined,
  sameAirline: undefined,
  sortBy: 'price',
  selectedMonths: [],
}

export interface CalendarDay {
  date: string         // YYYY-MM-DD
  destination: string  // IATA
  cheapestPrice: number
}

export interface CalendarResponse {
  days: CalendarDay[]
}

export const DESTINATION_INFO: Record<string, { name: string; city: string; country: string; unsplashId: string }> = {
  LIS: {
    name: 'Lisboa',
    city: 'Lisbon',
    country: 'Portugal',
    unsplashId: '1555881400-74d7acaacd8b',
  },
  MAD: {
    name: 'Madrid',
    city: 'Madrid',
    country: 'Espanha',
    unsplashId: '1539037116277-4db20889f2d4',
  },
}

export const AIRLINE_NAMES: Record<string, string> = {
  TP: 'TAP Air Portugal',
  IB: 'Iberia',
  LA: 'LATAM',
  JJ: 'LATAM Brasil',
  G3: 'Gol',
  AD: 'Azul',
  FR: 'Ryanair',
  VY: 'Vueling',
  U2: 'easyJet',
  AF: 'Air France',
  KL: 'KLM',
  LX: 'Swiss',
  LH: 'Lufthansa',
}

/** Snapshot bruto da API (preços podem vir como string por causa do Decimal) */
export interface SnapshotRow {
  id: number
  collectedAt: string
  flightDate: string
  returnDate: string | null
  airline: string | null
  priceBrl: string | number | null
  priceEur: string | number | null
  stops: number
  durationMinutes: number | null
  source: string
  route: {
    id: number
    origin: string
    destination: string
    tripType: string
  }
}

export interface SnapshotsResponse {
  snapshots: SnapshotRow[]
  meta: {
    lastCollectedAt: string | null
    onlyLastCollect: boolean
    total: number
  }
}

/** Ordenação da tabela de snapshots (dashboard) — espelha ?order= na API */
export type SnapshotSortOrder =
  | 'collectedAt_desc'
  | 'collectedAt_asc'
  | 'flightDate_asc'
  | 'flightDate_desc'
  | 'priceBrl_asc'
  | 'priceBrl_desc'
  | 'source_asc'
  | 'source_desc'

export interface SnapshotQueryFilters {
  lastCollect: boolean
  flightDate: string
  origin: string
  destination: string
  tripType: '' | 'oneway' | 'roundtrip'
  order: SnapshotSortOrder
}
