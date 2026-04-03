from datetime import timedelta

import pandas as pd

MIN_PRICES_FOR_SCORE = 15
MIN_DAYS_FOR_TREND = 7


def compute_route_stats(df: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega estatísticas históricas de preço por rota.
    Retorna DataFrame indexado por route_label com colunas:
    price_mean, price_min, price_p25, price_p75, all_prices (lista), count
    """
    if df.empty:
        return pd.DataFrame()

    rows = []
    for route_label, group in df.groupby("route_label"):
        prices = group["price_brl"].dropna()
        rows.append({
            "route_label": route_label,
            "price_mean": prices.mean(),
            "price_min": prices.min(),
            "price_p25": prices.quantile(0.25),
            "price_p75": prices.quantile(0.75),
            "all_prices": prices.values,
            "count": len(prices),
        })

    return pd.DataFrame(rows).set_index("route_label")


def compute_opportunity_score(
    price_brl: float,
    route_label: str,
    route_stats: pd.DataFrame,
) -> tuple[int | None, str | None]:
    """
    Score 0-100 baseado em percentil histórico.
    100 = preço mais barato que já apareceu.
    Retorna (None, None) se dados insuficientes (< 15 preços históricos).
    """
    if route_stats.empty or route_label not in route_stats.index:
        return None, None

    row = route_stats.loc[route_label]
    if row["count"] < MIN_PRICES_FOR_SCORE:
        return None, None

    all_prices = row["all_prices"]
    score = int((all_prices > price_brl).mean() * 100)

    if score >= 90:
        label = "Excelente"
    elif score >= 75:
        label = "Muito bom"
    elif score >= 60:
        label = "Bom"
    else:
        label = "Normal"

    return score, label


def compute_pct_vs_avg(
    price_brl: float,
    route_label: str,
    route_stats: pd.DataFrame,
) -> float | None:
    """Retorna % de diferença em relação à média histórica da rota."""
    if route_stats.empty or route_label not in route_stats.index:
        return None
    if route_stats.loc[route_label, "count"] < MIN_PRICES_FOR_SCORE:
        return None
    avg = route_stats.loc[route_label, "price_mean"]
    if not avg or avg == 0:
        return None
    return round((price_brl - avg) / avg * 100, 1)


def compute_price_trend(
    df_full: pd.DataFrame,
    route_label: str,
    flight_date: pd.Timestamp,
) -> dict:
    """
    Compara o preço mais recente de um voo com o preço de 7+ dias atrás.
    Retorna {"direction": None} se dados insuficientes.
    direction: "down" | "up" | "stable"
    """
    mask = (df_full["route_label"] == route_label) & (df_full["flight_date"] == flight_date)
    flight_df = df_full[mask].sort_values("collected_at")

    if len(flight_df) < 2:
        return {"direction": None, "pct": None}

    now = flight_df["collected_at"].max()
    cutoff = now - pd.Timedelta(days=MIN_DAYS_FOR_TREND)

    recent = flight_df[flight_df["collected_at"] >= cutoff]["price_brl"].min()
    old_df = flight_df[flight_df["collected_at"] < cutoff]

    if old_df.empty:
        return {"direction": None, "pct": None}

    old = old_df["price_brl"].min()

    if pd.isna(old) or old == 0:
        return {"direction": None, "pct": None}

    pct = round((recent - old) / old * 100, 1)

    if pct <= -5:
        direction = "down"
    elif pct >= 5:
        direction = "up"
    else:
        direction = "stable"

    return {"direction": direction, "pct": pct}


def is_best_price_60d(
    price_brl: float,
    route_label: str,
    flight_date: pd.Timestamp,
    df_full: pd.DataFrame,
) -> bool:
    """True se price_brl é o menor preço visto nos últimos 60 dias para esse voo."""
    cutoff = pd.Timestamp.utcnow().tz_localize(None) - pd.Timedelta(days=60)
    mask = (
        (df_full["route_label"] == route_label)
        & (df_full["flight_date"] == flight_date)
        & (df_full["collected_at"] >= cutoff)
    )
    subset = df_full[mask]["price_brl"].dropna()
    if len(subset) < 3:
        return False
    return float(price_brl) <= float(subset.min())


def stay_duration_analysis(
    df: pd.DataFrame,
    stay_options: list[int] = [15, 20, 25, 30],
    tolerance: int = 3,
) -> pd.DataFrame:
    """
    Para cada duração de estadia (em dias), encontra as melhores combinações
    de ida+volta nos dados de roundtrip.

    Usa snapshots roundtrip com return_date preenchido.
    tolerance = quantos dias de margem aceitar em volta da duração alvo.
    Ex: 20 dias com tolerance=3 aceita viagens de 17 a 23 dias.

    Retorna DataFrame com colunas:
    stay_target, stay_days, flight_date, return_date, price_brl,
    origin, destination, airline, stops, duration_fmt, gf_link
    """
    from dashboard.utils import build_gf_link, format_duration, format_airline

    rt = df[
        (df["trip_type"] == "roundtrip")
        & (df["return_date"].notna())
    ].copy()

    if rt.empty:
        return pd.DataFrame()

    rt["return_date"] = pd.to_datetime(rt["return_date"])
    rt["stay_days"] = (rt["return_date"] - rt["flight_date"]).dt.days
    rt = rt[rt["stay_days"] > 0]

    # Snapshot mais recente por (flight_date, route_label)
    rt = (
        rt.sort_values("collected_at")
        .groupby(["flight_date", "route_label"])
        .last()
        .reset_index()
    )

    today = pd.Timestamp.today().normalize()
    rt = rt[rt["flight_date"] >= today + pd.Timedelta(days=14)]

    rows = []
    for target in stay_options:
        bucket = rt[
            (rt["stay_days"] >= target - tolerance)
            & (rt["stay_days"] <= target + tolerance)
        ].sort_values("price_brl").head(10)

        for _, row in bucket.iterrows():
            fd = row["flight_date"]
            rd = row["return_date"]
            rows.append({
                "stay_target": target,
                "stay_days": int(row["stay_days"]),
                "flight_date": fd.date() if hasattr(fd, "date") else fd,
                "return_date": rd.date() if hasattr(rd, "date") else rd,
                "route_label": row["route_label"],
                "origin": row["origin"],
                "destination": row["destination"],
                "price_brl": row["price_brl"],
                "airline_fmt": format_airline(row.get("airline")),
                "stops": int(row["stops"]) if pd.notna(row.get("stops")) else 0,
                "duration_fmt": format_duration(row.get("duration_minutes")),
                "gf_link": build_gf_link(
                    row["origin"], row["destination"],
                    fd.date() if hasattr(fd, "date") else fd,
                    rd.date() if hasattr(rd, "date") else rd,
                ),
            })

    return pd.DataFrame(rows)


def stay_duration_pivot(df_stay: pd.DataFrame) -> pd.DataFrame:
    """
    Pivot: linhas = mês de partida, colunas = duração alvo (15/20/25/30),
    valores = menor preço encontrado.
    """
    if df_stay.empty:
        return pd.DataFrame()

    df = df_stay.copy()
    df["month"] = pd.to_datetime(df["flight_date"]).dt.to_period("M").astype(str)
    pivot = (
        df.groupby(["month", "stay_target"])["price_brl"]
        .min()
        .reset_index()
        .pivot(index="month", columns="stay_target", values="price_brl")
    )
    pivot.columns = [f"{c} dias" for c in pivot.columns]
    return pivot


def get_destination_comparison(df_full: pd.DataFrame) -> dict | None:
    """
    Compara o menor preço atual entre destinos LIS e MAD (rotas REC→*).
    Retorna None se não há dados suficientes para comparar.
    """
    if df_full.empty or "destination" not in df_full.columns:
        return None

    today = pd.Timestamp.today().normalize()
    future = df_full[
        (df_full["origin"] == "REC") & (df_full["flight_date"] >= today)
    ]

    lis = future[future["destination"] == "LIS"]["price_brl"].min()
    mad = future[future["destination"] == "MAD"]["price_brl"].min()

    if pd.isna(lis) or pd.isna(mad):
        return None

    best = "LIS" if lis <= mad else "MAD"
    diff = abs(mad - lis)

    return {
        "best": best,
        "diff": round(diff),
        "min_lis": round(lis),
        "min_mad": round(mad),
    }
