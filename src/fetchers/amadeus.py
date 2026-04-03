"""
Amadeus for Developers — Self-Service Production
Registro: https://developers.amadeus.com/
IMPORTANTE: Use ambiente de PRODUÇÃO (não sandbox — sandbox tem dados simulados).
Após criar conta, solicitar "Self-Service Production Access" (gratuito, ~1-2 dias úteis).

Free tier produção: 10.000 chamadas/mês.
Usado aqui como backup e validação cruzada.
"""
import os
import httpx
from datetime import date, datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

AMADEUS_CLIENT_ID = os.getenv("AMADEUS_CLIENT_ID", "")
AMADEUS_CLIENT_SECRET = os.getenv("AMADEUS_CLIENT_SECRET", "")

# Use produção — não use test.api.amadeus.com
AMADEUS_AUTH_URL = "https://api.amadeus.com/v1/security/oauth2/token"
AMADEUS_BASE_URL = "https://api.amadeus.com"

_token_cache: dict = {"token": None, "expires_at": datetime.min}


def _is_configured() -> bool:
    return bool(AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET)


def _get_token() -> str | None:
    global _token_cache

    if _token_cache["token"] and datetime.utcnow() < _token_cache["expires_at"]:
        return _token_cache["token"]

    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                AMADEUS_AUTH_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": AMADEUS_CLIENT_ID,
                    "client_secret": AMADEUS_CLIENT_SECRET,
                },
            )
            response.raise_for_status()
            data = response.json()
            _token_cache["token"] = data["access_token"]
            _token_cache["expires_at"] = datetime.utcnow() + timedelta(seconds=data.get("expires_in", 1799) - 60)
            return _token_cache["token"]
    except Exception as e:
        print(f"[Amadeus] Falha ao obter token: {e}")
        return None


def fetch_month_sample(origin: str, destination: str, year: int, month: int) -> list[dict]:
    """
    Consulta o Amadeus para uma amostra de datas do mês (sextas e segundas).
    Usado como fallback quando a Aviasales não tem cobertura para a rota.
    ~8 chamadas por mês em vez de 30.
    """
    import calendar
    results = []
    _, days_in_month = calendar.monthrange(year, month)
    for day in range(1, days_in_month + 1):
        d = date(year, month, day)
        if d.weekday() in (0, 4):  # segunda=0, sexta=4
            offers = fetch_flight_offers(origin, destination, d, max_results=1)
            results.extend(offers)
    return results


def fetch_flight_offers(origin: str, destination: str, departure_date: date, max_results: int = 5) -> list[dict]:
    """
    Busca as melhores ofertas para uma data específica.
    Usar para validar/enriquecer as datas mais baratas encontradas pelo Aviasales/Kiwi.
    """
    if not _is_configured():
        return []

    token = _get_token()
    if not token:
        return []

    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{AMADEUS_BASE_URL}/v2/shopping/flight-offers",
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "originLocationCode": origin,
                    "destinationLocationCode": destination,
                    "departureDate": departure_date.isoformat(),
                    "adults": 1,
                    "max": max_results,
                    "currencyCode": "BRL",
                    "nonStop": "false",
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Amadeus] Erro buscando {origin}→{destination} {departure_date}: {e}")
        return []

    results = []
    for offer in data.get("data", []):
        try:
            price_brl = float(offer["price"]["grandTotal"])
            itinerary = offer["itineraries"][0]
            segments = itinerary["segments"]
            first_seg = segments[0]
            dep_date = datetime.fromisoformat(first_seg["departure"]["at"][:10]).date()
            airline = offer.get("validatingAirlineCodes", ["?"])[0]

            # Duração em minutos
            duration_str = itinerary.get("duration", "PT0M")  # ex: PT14H30M
            hours = int(duration_str.split("H")[0].replace("PT", "")) if "H" in duration_str else 0
            minutes = int(duration_str.split("H")[-1].replace("M", "").replace("PT", "")) if "M" in duration_str else 0
            duration_minutes = hours * 60 + minutes

            results.append({
                "flight_date": dep_date,
                "return_date": None,
                "airline": airline,
                "price_brl": price_brl,
                "price_eur": None,
                "stops": len(segments) - 1,
                "duration_minutes": duration_minutes,
                "source": "amadeus",
            })
        except Exception:
            continue

    return results
