import {
  SearchFilters,
  GroupedPackagesResponse,
  SnapshotsResponse,
  SnapshotQueryFilters,
  SnapshotSortOrder,
  CalendarResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const PAGE_SIZE = 20;

export async function fetchPackages(
  filters: SearchFilters,
  offset = 0,
): Promise<GroupedPackagesResponse> {
  const params = new URLSearchParams();

  if (filters.destinations.length > 0) {
    params.set("destinations", filters.destinations.join(","));
  }
  params.set("minStayDays", String(filters.minStayDays));
  params.set("maxStayDays", String(filters.maxStayDays));
  params.set("sortBy", filters.sortBy);
  params.set("limit", String(PAGE_SIZE));
  params.set("offset", String(offset));

  if (filters.departAfter) params.set("departAfter", filters.departAfter);
  if (filters.departBefore) params.set("departBefore", filters.departBefore);
  if (filters.maxStops !== undefined)
    params.set("maxStops", String(filters.maxStops));
  if (filters.maxPriceBrl !== undefined)
    params.set("maxPriceBrl", String(filters.maxPriceBrl));
  if (filters.sameAirline !== undefined)
    params.set("sameAirline", String(filters.sameAirline));

  const res = await fetch(`${API_URL}/api/packages?${params.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function triggerCollect(): Promise<{
  started: boolean;
  message: string;
}> {
  const res = await fetch(`${API_URL}/api/collect`, { method: "POST" });
  if (!res.ok) throw new Error(`Collect error: ${res.status}`);
  return res.json();
}

export async function fetchSnapshots(
  f: SnapshotQueryFilters,
): Promise<SnapshotsResponse> {
  const params = new URLSearchParams();
  if (f.lastCollect) params.set("lastCollect", "true");
  if (f.flightDate) params.set("flightDate", f.flightDate);
  if (f.origin.trim()) params.set("origin", f.origin.trim().toUpperCase());
  if (f.destination.trim())
    params.set("destination", f.destination.trim().toUpperCase());
  if (f.tripType) params.set("tripType", f.tripType);
  const order: SnapshotSortOrder = f.order ?? "collectedAt_desc";
  params.set("order", order);

  const res = await fetch(`${API_URL}/api/snapshots?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function fetchCalendar(
  destinations: string[],
  departAfter: string,
  departBefore: string,
  minStayDays: number,
  maxStayDays: number,
): Promise<CalendarResponse> {
  const params = new URLSearchParams()
  if (destinations.length > 0) params.set("destinations", destinations.join(","))
  if (departAfter) params.set("departAfter", departAfter)
  if (departBefore) params.set("departBefore", departBefore)
  params.set("minStayDays", String(minStayDays))
  params.set("maxStayDays", String(maxStayDays))
  const res = await fetch(`${API_URL}/api/calendar?${params.toString()}`, {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export function buildGoogleFlightsUrl(
  origin: string,
  destination: string,
  departDate: string,
  returnDate?: string,
): string {
  const fmt = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
  const q = returnDate
    ? `voos ${origin} ${destination} ${fmt(departDate)} volta ${fmt(returnDate)}`
    : `voos ${origin} ${destination} ${fmt(departDate)}`
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=pt-BR&curr=BRL`
}

export function buildSkyscannerUrl(
  origin: string,
  destination: string,
  departDate: string,
  returnDate?: string,
): string {
  const base = "https://www.skyscanner.com.br/transporte/passagens-aereas";
  const from = origin.toLowerCase();
  const to = destination.toLowerCase();
  const dep = departDate.replace(/-/g, "");
  if (returnDate) {
    const ret = returnDate.replace(/-/g, "");
    return `${base}/${from}/${to}/${dep}/${ret}/?adultsv2=1&cabinclass=economy`;
  }
  return `${base}/${from}/${to}/${dep}/?adultsv2=1&cabinclass=economy&rtn=0`;
}

export function getUnsplashUrl(
  photoId: string,
  width = 300,
  height = 200,
): string {
  return `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${width}&h=${height}&q=80`;
}
