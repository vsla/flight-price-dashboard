"""
SerpAPI — Google Flights
Registro: https://serpapi.com/
Documentação: https://serpapi.com/google-flights-api

Free tier: 250 queries/mês (sem cartão de crédito)
Usado para round-trips onde Aviasales não tem calendário de preços.
"""
import os
import httpx
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_KEY", "")
BASE_URL = "https://serpapi.com/search.json"


def _is_configured() -> bool:
    return bool(SERPAPI_KEY)


def fetch_roundtrip(
    origin: str, destination: str, departure_date: date, nights: int = 14
) -> list[dict]:
    """
    Busca round-trip para uma data específica de partida.
    Retorna apenas o voo mais barato encontrado para não desperdiçar quota.
    """
    if not _is_configured():
        return []

    return_date = departure_date + timedelta(days=nights)

    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                BASE_URL,
                params={
                    "engine": "google_flights",
                    "departure_id": origin,
                    "arrival_id": destination,
                    "outbound_date": departure_date.isoformat(),
                    "return_date": return_date.isoformat(),
                    "type": "1",       # 1 = round-trip
                    "currency": "BRL",
                    "hl": "pt",
                    "gl": "br",
                    "api_key": SERPAPI_KEY,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[SerpAPI] Erro roundtrip {origin}→{destination} {departure_date}: {e}")
        return []

    candidates = []
    for flight in data.get("best_flights", []) + data.get("other_flights", []):
        try:
            price_brl = float(flight.get("price", 0))
            if price_brl <= 0:
                continue
            legs = flight.get("flights", [])
            if not legs:
                continue
            airline = legs[0].get("airline", "?")
            duration_minutes = sum(f.get("duration", 0) for f in legs)
            stops = len(legs) - 1
            candidates.append({
                "flight_date": departure_date,
                "return_date": return_date,
                "airline": airline,
                "price_brl": price_brl,
                "price_eur": None,
                "stops": stops,
                "duration_minutes": duration_minutes,
                "source": "serpapi",
            })
        except Exception:
            continue

    if not candidates:
        return []
    return [min(candidates, key=lambda x: x["price_brl"])]
