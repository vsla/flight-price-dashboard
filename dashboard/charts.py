import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

from dashboard.analytics import (
    compute_opportunity_score,
    compute_pct_vs_avg,
    compute_price_trend,
    is_best_price_60d,
    compute_route_stats,
)
from dashboard.utils import build_gf_link, format_duration, format_airline


def price_heatmap(df: pd.DataFrame, title: str) -> go.Figure:
    """Calendário de preços: linhas = meses, colunas = dias."""
    if df.empty:
        return go.Figure().update_layout(title=f"{title} — sem dados")

    df = df.copy()
    df["month"] = df["flight_date"].dt.to_period("M").astype(str)
    df["day"] = df["flight_date"].dt.day

    pivot = df.groupby(["month", "day"])["price_brl"].min().reset_index()
    pivot_table = pivot.pivot(index="month", columns="day", values="price_brl")

    fig = px.imshow(
        pivot_table,
        labels={"x": "Dia", "y": "Mês", "color": "R$ (menor preço)"},
        color_continuous_scale="RdYlGn_r",
        title=title,
        aspect="auto",
    )
    fig.update_layout(coloraxis_colorbar_title="R$")
    return fig


def price_trend(df: pd.DataFrame, flight_date: pd.Timestamp, title: str) -> go.Figure:
    """
    Mostra como o preço de um voo específico mudou ao longo do tempo.
    Eixo X = data da coleta, Eixo Y = preço coletado naquele dia.
    """
    mask = df["flight_date"] == flight_date
    subset = df[mask].sort_values("collected_at")

    if subset.empty:
        return go.Figure().update_layout(title=f"{title} — sem dados para {flight_date}")

    fig = px.line(
        subset,
        x="collected_at",
        y="price_brl",
        color="source",
        markers=True,
        title=f"{title} — voo de {flight_date}",
        labels={"collected_at": "Coletado em", "price_brl": "Preço (R$)", "source": "Fonte"},
    )
    fig.update_layout(hovermode="x unified")
    return fig


def top_cheapest_table(
    df_filtered: pd.DataFrame,
    df_full: pd.DataFrame,
    n: int = 20,
) -> pd.DataFrame:
    """
    Retorna os N voos mais baratos com score, tendência e link para compra.
    df_full é usado para calcular contexto histórico (score, trend, 60d).
    """
    today = pd.Timestamp.today().normalize()
    min_date = today + pd.Timedelta(days=14)
    future = df_filtered[df_filtered["flight_date"] >= min_date].copy()

    if future.empty:
        return pd.DataFrame()

    # Snapshot mais recente por (flight_date, route_label)
    latest = (
        future.sort_values("collected_at")
        .groupby(["flight_date", "route_label"])
        .last()
        .reset_index()
        .sort_values("price_brl")
        .head(n)
    )

    route_stats = compute_route_stats(df_full)

    rows = []
    for _, row in latest.iterrows():
        price = row["price_brl"]
        route = row["route_label"]
        fd = row["flight_date"]

        score, score_label = compute_opportunity_score(price, route, route_stats)
        pct = compute_pct_vs_avg(price, route, route_stats)
        trend = compute_price_trend(df_full, route, fd)
        best_60d = is_best_price_60d(price, route, fd, df_full)

        ret_date = row.get("return_date")
        if pd.isna(ret_date) if isinstance(ret_date, float) else ret_date is None:
            ret_date = None

        rows.append({
            "flight_date": fd.date() if hasattr(fd, "date") else fd,
            "route_label": route,
            "price_brl": price,
            "score": score,
            "score_label": score_label,
            "pct_vs_avg": pct,
            "trend_direction": trend["direction"],
            "trend_pct": trend["pct"],
            "best_60d": best_60d,
            "airline_fmt": format_airline(row.get("airline")),
            "stops": int(row["stops"]) if pd.notna(row.get("stops")) else 0,
            "duration_fmt": format_duration(row.get("duration_minutes")),
            "source": row.get("source", "—"),
            "gf_link": build_gf_link(
                row["origin"], row["destination"], fd.date() if hasattr(fd, "date") else fd,
                ret_date.date() if hasattr(ret_date, "date") else ret_date,
            ),
        })

    return pd.DataFrame(rows)


def route_comparison_chart(dfs: dict[str, pd.DataFrame]) -> go.Figure:
    """
    Barras agrupadas por mês para N rotas.
    dfs = {"REC→LIS [oneway]": df, "REC→MAD [oneway]": df, ...}
    """
    fig = go.Figure()

    for label, df in dfs.items():
        if df.empty:
            continue
        d = df.copy()
        d["month"] = d["flight_date"].dt.to_period("M").astype(str)
        monthly = d.groupby("month")["price_brl"].min().reset_index()
        fig.add_trace(go.Bar(
            x=monthly["month"],
            y=monthly["price_brl"],
            name=label,
        ))

    fig.update_layout(
        barmode="group",
        title="Comparativo de rotas por mês",
        xaxis_title="Mês de partida",
        yaxis_title="Menor preço (R$)",
        legend_title="Rota",
    )
    return fig


def opportunities_bars(df: pd.DataFrame, n: int = 10) -> go.Figure:
    """Barras horizontais das N melhores oportunidades, cor por destino."""
    if df.empty:
        return go.Figure().update_layout(title="Sem dados")

    top = df.head(n).copy()
    top["label"] = top.apply(
        lambda r: f"{pd.Timestamp(r['flight_date']).strftime('%d/%m/%Y')} · {r['route_label']}",
        axis=1,
    )

    color_map = {"LIS": "#1f77b4", "MAD": "#ff7f0e"}
    colors = top["route_label"].apply(
        lambda r: color_map.get(r.split("→")[1].split(" ")[0] if "→" in r else "", "#888")
    )

    fig = go.Figure(go.Bar(
        x=top["price_brl"],
        y=top["label"],
        orientation="h",
        marker_color=colors,
        customdata=top[["score", "stops", "duration_fmt"]].values,
        hovertemplate=(
            "<b>%{y}</b><br>"
            "Preço: R$ %{x:,.0f}<br>"
            "Score: %{customdata[0]}<br>"
            "Paradas: %{customdata[1]}<br>"
            "Duração: %{customdata[2]}<extra></extra>"
        ),
    ))

    fig.update_layout(
        title="Melhores oportunidades",
        xaxis_title="Preço (R$)",
        yaxis={"autorange": "reversed"},
        height=max(300, n * 45),
    )
    return fig


def stay_duration_heatmap(pivot: pd.DataFrame) -> go.Figure:
    """
    Heatmap: linhas = mês de partida, colunas = duração da estadia (15/20/25/30 dias).
    Verde = mais barato, vermelho = mais caro.
    """
    if pivot.empty:
        return go.Figure().update_layout(title="Sem dados de roundtrip com datas de volta")

    fig = px.imshow(
        pivot,
        labels={"x": "Duração da estadia", "y": "Mês de partida", "color": "R$ (menor preço)"},
        color_continuous_scale="RdYlGn_r",
        title="Preço por duração de estadia e mês de partida",
        aspect="auto",
        text_auto=".0f",
    )
    fig.update_layout(coloraxis_colorbar_title="R$")
    return fig


def price_seasonality(df: pd.DataFrame, title: str) -> go.Figure:
    """Preço médio por mês — identifica sazonalidade."""
    if df.empty:
        return go.Figure().update_layout(title=f"{title} — sem dados")

    d = df.copy()
    d["month"] = d["flight_date"].dt.to_period("M").astype(str)
    avg = d.groupby("month")["price_brl"].mean().reset_index()
    avg.columns = ["Mês", "Preço médio (R$)"]

    fig = px.bar(
        avg, x="Mês", y="Preço médio (R$)",
        title=f"{title} — sazonalidade de preços",
        color="Preço médio (R$)",
        color_continuous_scale="RdYlGn_r",
    )
    return fig
