"""
Aviasales / Travelpayouts API
Registro: https://travelpayouts.com/
Documentação: https://support.travelpayouts.com/hc/en-us/articles/203956085

Endpoint de calendário: retorna o preço mais barato por dia do mês inteiro em 1 chamada.
Ideal para varredura eficiente dos próximos 12 meses.
"""
import os
import httpx
from datetime import date, datetime
from dotenv import load_dotenv

load_dotenv()

AVIASALES_TOKEN = os.getenv("AVIASALES_TOKEN", "")
BASE_URL = "https://api.travelpayouts.com"


def _is_configured() -> bool:
    return bool(AVIASALES_TOKEN)


def fetch_month_calendar(origin: str, destination: str, year: int, month: int) -> list[dict]:
    """
    Retorna o preço mais barato para cada dia do mês (só ida).
    1 chamada de API retorna preços de um mês inteiro — muito eficiente.
    """
    if not _is_configured():
        return []

    depart_date = f"{year}-{month:02d}"

    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{BASE_URL}/v1/prices/calendar",
                params={
                    "origin": origin,
                    "destination": destination,
                    "depart_date": depart_date,
                    "currency": "brl",
                    "show_to_affiliates": "false",
                    "token": AVIASALES_TOKEN,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Aviasales] Erro calendário {origin}→{destination} {depart_date}: {e}")
        return []

    if not data.get("success") or not data.get("data"):
        print(f"[Aviasales] Sem dados para {origin}→{destination} {depart_date}: success={data.get('success')}, data={data.get('data')}, raw={data}")
        return []

    results = []
    for date_str, info in data["data"].items():
        try:
            flight_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            price_brl = float(info.get("price", 0))
            if price_brl <= 0:
                continue

            results.append({
                "flight_date": flight_date,
                "return_date": None,
                "airline": info.get("airline", "?"),
                "price_brl": price_brl,
                "price_eur": None,  # Aviasales não retorna EUR neste endpoint
                "stops": info.get("transfers", 0),
                "duration_minutes": None,
                "source": "aviasales",
            })
        except Exception:
            continue

    return results


def fetch_cheap_prices(origin: str, destination: str) -> list[dict]:
    """
    Retorna os voos mais baratos disponíveis (sem data específica).
    Útil para ter uma visão geral rápida de oportunidades.
    """
    if not _is_configured():
        return []

    try:
        with httpx.Client(timeout=30) as client:
            response = client.get(
                f"{BASE_URL}/v1/prices/cheap",
                params={
                    "origin": origin,
                    "destination": destination,
                    "currency": "brl",
                    "token": AVIASALES_TOKEN,
                },
            )
            response.raise_for_status()
            data = response.json()
    except Exception as e:
        print(f"[Aviasales] Erro cheap prices {origin}→{destination}: {e}")
        return []

    if not data.get("success") or not data.get("data"):
        return []

    results = []
    dest_data = data["data"].get(destination, {})
    for trip_class, info in dest_data.items():
        try:
            dep_date_str = info.get("depart_date", "")
            if not dep_date_str:
                continue
            flight_date = datetime.strptime(dep_date_str, "%Y-%m-%d").date()
            price_brl = float(info.get("price", 0))
            if price_brl <= 0:
                continue

            results.append({
                "flight_date": flight_date,
                "return_date": None,
                "airline": info.get("airline", "?"),
                "price_brl": price_brl,
                "price_eur": None,
                "stops": info.get("transfers", 0),
                "duration_minutes": None,
                "source": "aviasales",
            })
        except Exception:
            continue

    return results
