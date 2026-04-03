"""
Coleta diária de preços de passagens.
Roda automaticamente às 6h todos os dias via APScheduler.
"""
from datetime import date, datetime
from dateutil.relativedelta import relativedelta

from .db.connection import get_session
from .db.models import Route, PriceSnapshot
from .fetchers import aviasales, serpapi, amadeus


MONTHS_AHEAD = 12  # quantos meses à frente monitorar


def fetch_and_store_route(route: Route, session):
    today = date.today()
    collected_at = datetime.utcnow()
    total_saved = 0

    for delta in range(MONTHS_AHEAD):
        target = today + relativedelta(months=delta)
        year, month = target.year, target.month

        print(f"  [{route.origin}→{route.destination} {route.trip_type}] {year}-{month:02d}...")

        # --- Aviasales: calendário do mês (1 chamada → todos os dias) ---
        aviasales_oneway = aviasales.fetch_month_calendar(route.origin, route.destination, year, month)

        if route.trip_type == "oneway":
            if aviasales_oneway:
                flights = aviasales_oneway
            elif amadeus._is_configured():
                print(f"  [Aviasales] Sem dados para {route.origin}→{route.destination} — usando Amadeus como fallback.")
                flights = amadeus.fetch_month_sample(route.origin, route.destination, year, month)
            else:
                flights = []
        else:
            # Aviasales não tem endpoint de calendário para round-trip
            flights = []

        # --- SerpAPI: round-trips nas datas mais baratas (economiza quota) ---
        if route.trip_type == "roundtrip" and serpapi._is_configured():
            top_dates = sorted(aviasales_oneway, key=lambda x: x["price_brl"])[:5]
            serpapi_flights = []
            for proxy in top_dates:
                serpapi_flights.extend(
                    serpapi.fetch_roundtrip(route.origin, route.destination, proxy["flight_date"])
                )
        else:
            serpapi_flights = []

        # Merge por data de partida
        merged: dict[date, dict] = {f["flight_date"]: f for f in flights}
        for f in serpapi_flights:
            d = f["flight_date"]
            if d not in merged or f["price_brl"] <= merged[d]["price_brl"]:
                merged[d] = f

        # Salva no banco
        for flight_date, f in merged.items():
            if f["price_brl"] and f["price_brl"] > 0:
                snapshot = PriceSnapshot(
                    collected_at=collected_at,
                    route_id=route.id,
                    flight_date=flight_date,
                    return_date=f.get("return_date"),
                    airline=f.get("airline"),
                    price_brl=f["price_brl"],
                    price_eur=f.get("price_eur"),
                    stops=f.get("stops", 0),
                    duration_minutes=f.get("duration_minutes"),
                    source=f.get("source", "unknown"),
                )
                session.add(snapshot)
                total_saved += 1

        # Amadeus: valida apenas o dia mais barato do mês (economiza cota — quando disponível)
        if merged and amadeus._is_configured():
            cheapest_date = min(merged, key=lambda d: merged[d]["price_brl"])
            amadeus_flights = amadeus.fetch_flight_offers(
                route.origin, route.destination, cheapest_date, max_results=1
            )
            for f in amadeus_flights:
                snapshot = PriceSnapshot(
                    collected_at=collected_at,
                    route_id=route.id,
                    flight_date=f["flight_date"],
                    return_date=f.get("return_date"),
                    airline=f.get("airline"),
                    price_brl=f["price_brl"],
                    price_eur=f.get("price_eur"),
                    stops=f.get("stops", 0),
                    duration_minutes=f.get("duration_minutes"),
                    source="amadeus",
                )
                session.add(snapshot)
                total_saved += 1

    session.commit()
    return total_saved


def run_daily_fetch():
    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M')}] Iniciando coleta diária...")

    with get_session() as session:
        routes = session.query(Route).filter_by(is_active=True).all()
        total = 0
        for route in routes:
            print(f"\nRota: {route.origin} → {route.destination} [{route.trip_type}]")
            saved = fetch_and_store_route(route, session)
            total += saved
            print(f"  Salvo: {saved} registros")

    print(f"\nColeta concluída. Total: {total} snapshots.")
