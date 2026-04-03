from datetime import date


def build_gf_link(
    origin: str,
    destination: str,
    flight_date: date,
    return_date: date | None = None,
) -> str:
    base = (
        f"https://www.google.com/travel/flights?q=Flights+from+"
        f"{origin}+to+{destination}+on+{flight_date.isoformat()}"
    )
    if return_date:
        base += f"+returning+{return_date.isoformat()}"
    return base


def format_duration(minutes: int | None) -> str:
    try:
        minutes = int(minutes)
    except (TypeError, ValueError):
        return "—"
    if minutes <= 0:
        return "—"
    h = minutes // 60
    m = minutes % 60
    return f"{h}h {m:02d}min" if m else f"{h}h"


def format_airline(airline: str | None) -> str:
    if not airline or str(airline).strip() in ("", "?", "nan", "None"):
        return "—"
    return str(airline).strip()


def parse_route_label(label: str) -> dict:
    # "REC→LIS [oneway]" → {"origin": "REC", "destination": "LIS", "trip_type": "oneway"}
    try:
        od_part, type_part = label.split(" ", 1)
        origin, destination = od_part.split("→")
        trip_type = type_part.strip("[]")
        return {"origin": origin, "destination": destination, "trip_type": trip_type}
    except Exception:
        return {"origin": "?", "destination": "?", "trip_type": "?"}
