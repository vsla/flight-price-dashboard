"""
Flight Price Tracker — Dashboard

Execução:
  streamlit run dashboard/app.py
"""
import os
import sys
import pandas as pd
import streamlit as st
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv()

from src.db.connection import get_session, init_db
from src.db.models import Route, PriceSnapshot
from dashboard.utils import parse_route_label, build_gf_link, format_duration, format_airline
from dashboard.analytics import compute_route_stats, get_destination_comparison
from dashboard.analytics import (
    compute_route_stats,
    get_destination_comparison,
    stay_duration_analysis,
    stay_duration_pivot,
)
from dashboard.charts import (
    price_heatmap,
    price_trend,
    top_cheapest_table,
    route_comparison_chart,
    opportunities_bars,
    stay_duration_heatmap,
    price_seasonality,
)

st.set_page_config(
    page_title="Flight Price Tracker",
    page_icon="✈️",
    layout="wide",
)

st.title("✈️ Flight Price Tracker — Recife → Europa")
st.caption("Monitoramento diário de preços. Quando encontrar uma boa data, confirme no Google Flights antes de comprar.")


@st.cache_data(ttl=300)
def load_data() -> pd.DataFrame:
    try:
        init_db()
        with get_session() as session:
            routes = session.query(Route).filter_by(is_active=True).all()
            route_map = {
                r.id: f"{r.origin}→{r.destination} [{r.trip_type}]"
                for r in routes
            }

            snapshots = session.query(PriceSnapshot).all()
            if not snapshots:
                return pd.DataFrame()

            rows = []
            for s in snapshots:
                label = route_map.get(s.route_id, "?")
                parsed = parse_route_label(label)
                rows.append({
                    "id": s.id,
                    "collected_at": s.collected_at,
                    "route_id": s.route_id,
                    "route_label": label,
                    "origin": parsed["origin"],
                    "destination": parsed["destination"],
                    "trip_type": parsed["trip_type"],
                    "flight_date": s.flight_date,
                    "return_date": s.return_date,
                    "airline": s.airline,
                    "price_brl": float(s.price_brl) if s.price_brl else None,
                    "stops": s.stops,
                    "duration_minutes": s.duration_minutes,
                    "source": s.source,
                })

            df = pd.DataFrame(rows)
            df["flight_date"] = pd.to_datetime(df["flight_date"])
            df["collected_at"] = pd.to_datetime(df["collected_at"])
            return df
    except Exception as e:
        st.error(f"Erro ao conectar ao banco de dados: {e}")
        return pd.DataFrame()


df = load_data()

# Histórico completo para analytics (não filtrado)
df_full = df.copy() if not df.empty else pd.DataFrame()
route_stats = compute_route_stats(df_full) if not df_full.empty else pd.DataFrame()
dest_comparison = get_destination_comparison(df_full) if not df_full.empty else None


# ── Sidebar ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Filtros")

    if df.empty:
        st.warning("Nenhum dado encontrado. Execute a coleta primeiro:\n\n`python -m src.main --once`")
        st.stop()

    all_routes = sorted(df["route_label"].unique())
    selected_routes = st.multiselect(
        "Rotas", all_routes,
        default=all_routes[:2] if len(all_routes) >= 2 else all_routes,
    )

    min_date = df["flight_date"].min().date()
    max_date = df["flight_date"].max().date()

    today = date.today()
    default_start = max(min_date, today)
    default_end = min(max_date, today + timedelta(days=365))
    if default_start > default_end:
        default_start, default_end = min_date, max_date

    date_range = st.date_input(
        "Período do voo",
        value=(default_start, default_end),
        min_value=min_date,
        max_value=max_date,
    )

    max_price = st.slider("Preço máximo (R$)", 500, 20000, 10000, step=500)

    max_stops = st.slider("Máx. paradas", 0, 3, 3)

    st.divider()
    if st.button("Atualizar dados"):
        st.cache_data.clear()
        st.rerun()


# ── Aplica filtros ───────────────────────────────────────────────────────────
if len(date_range) == 2:
    start_date, end_date = date_range
else:
    start_date = end_date = date_range[0]

mask = (
    df["route_label"].isin(selected_routes)
    & (df["flight_date"].dt.date >= start_date)
    & (df["flight_date"].dt.date <= end_date)
    & (df["price_brl"] <= max_price)
    & (df["stops"] <= max_stops)
)
filtered = df[mask].copy()


# ── KPIs ─────────────────────────────────────────────────────────────────────
col1, col2, col3, col4 = st.columns(4)
col1.metric("Menor preço encontrado", f"R$ {filtered['price_brl'].min():,.0f}" if not filtered.empty else "—")
col2.metric("Preço médio", f"R$ {filtered['price_brl'].mean():,.0f}" if not filtered.empty else "—")
col3.metric("Snapshots coletados", f"{len(filtered):,}")
col4.metric("Última coleta", df["collected_at"].max().strftime("%d/%m %H:%M") if not df.empty else "—")

st.divider()


# ── Tabs ─────────────────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4 = st.tabs([
    "🎯 Oportunidades",
    "📅 Calendário",
    "⚖️ Comparar Rotas",
    "📊 Histórico",
])


# ── Tab 1: Oportunidades ─────────────────────────────────────────────────────
with tab1:
    # Banner de comparação LIS vs MAD
    if dest_comparison:
        c = dest_comparison
        best_name = "Lisboa" if c["best"] == "LIS" else "Madrid"
        other_name = "Madrid" if c["best"] == "LIS" else "Lisboa"
        st.info(
            f"✈️ **Melhor destino agora: {best_name}** — "
            f"R$ {c['min_lis']:,} (LIS) vs R$ {c['min_mad']:,} (MAD) — "
            f"R$ {c['diff']:,} mais barato que {other_name}"
        )

    top_df = top_cheapest_table(filtered, df_full, n=20)

    if top_df.empty:
        st.info("Nenhum voo encontrado com os filtros atuais.")
    else:
        # Top 5 cards
        st.subheader("Melhores oportunidades agora")
        top5 = top_df.head(5)
        cols = st.columns(min(5, len(top5)))

        for i, col in enumerate(cols):
            if i >= len(top5):
                break
            row = top5.iloc[i]
            with col:
                # Rota e preço principal
                parts = row["route_label"].split(" ")
                st.caption(row["route_label"])
                st.metric("", f"R$ {row['price_brl']:,.0f}")

                # Score (só se disponível)
                if row["score"] is not None:
                    st.caption(f"🏅 Score: **{row['score']}/100** · {row['score_label']}")

                # % vs média (só se disponível)
                if row["pct_vs_avg"] is not None:
                    pct = row["pct_vs_avg"]
                    icon = "📉" if pct < 0 else "📈"
                    st.caption(f"{icon} {pct:+.0f}% vs média")

                # Tendência (só se disponível)
                if row["trend_direction"] is not None:
                    t = row["trend_direction"]
                    tp = row["trend_pct"]
                    icons = {"down": "📉", "up": "📈", "stable": "➡️"}
                    labels = {"down": "caindo", "up": "subindo", "stable": "estável"}
                    st.caption(f"{icons[t]} {tp:+.0f}% na semana ({labels[t]})")

                # Badge 60 dias
                if row["best_60d"]:
                    st.caption("🔥 Melhor preço dos últimos 60 dias")

                # Detalhes do voo
                flight_dt = pd.Timestamp(row["flight_date"])
                details = f"📅 {flight_dt.strftime('%d/%m/%Y')}"
                if row["duration_fmt"] != "—":
                    details += f" · ⏱ {row['duration_fmt']}"
                details += f" · {row['stops']} parada(s)"
                if row["airline_fmt"] != "—":
                    details += f" · {row['airline_fmt']}"
                st.caption(details)

                st.link_button("Ver no Google Flights", row["gf_link"], use_container_width=True)

                # Histórico do voo (expander)
                with st.expander("Ver histórico de preço"):
                    fig_hist = price_trend(
                        df_full[df_full["route_label"] == row["route_label"]],
                        pd.Timestamp(row["flight_date"]),
                        row["route_label"],
                    )
                    st.plotly_chart(fig_hist, use_container_width=True)

        st.divider()

        # Gráfico de barras das oportunidades
        st.plotly_chart(opportunities_bars(top_df, n=10), use_container_width=True)

        st.divider()

        # Tabela Top 20
        st.subheader("Top 20 datas mais baratas")

        display_df = top_df[[
            "flight_date", "route_label", "price_brl", "score",
            "pct_vs_avg", "airline_fmt", "stops", "duration_fmt", "source", "gf_link",
        ]].rename(columns={
            "flight_date": "Data",
            "route_label": "Rota",
            "price_brl": "Preço (R$)",
            "score": "Score",
            "pct_vs_avg": "vs Média (%)",
            "airline_fmt": "Cia",
            "stops": "Paradas",
            "duration_fmt": "Duração",
            "source": "Fonte",
            "gf_link": "Comprar",
        })

        st.dataframe(
            display_df,
            column_config={
                "Comprar": st.column_config.LinkColumn("Comprar", display_text="Abrir GF"),
                "Preço (R$)": st.column_config.NumberColumn("Preço (R$)", format="R$ %.0f"),
                "Score": st.column_config.NumberColumn("Score", format="%d/100"),
                "vs Média (%)": st.column_config.NumberColumn("vs Média", format="%.0f%%"),
            },
            hide_index=True,
            use_container_width=True,
        )

        st.divider()

        # Mini heatmaps por destino
        for dest, dest_name in [("LIS", "Lisboa"), ("MAD", "Madrid")]:
            dest_df = filtered[filtered["destination"] == dest]
            if dest_df.empty:
                continue
            latest_dest = (
                dest_df.sort_values("collected_at")
                .groupby("flight_date")
                .last()
                .reset_index()
            )
            fig_hm = price_heatmap(latest_dest, f"Calendário de preços — {dest_name} ({dest})")
            st.plotly_chart(fig_hm, use_container_width=True)


# ── Tab 2: Calendário ────────────────────────────────────────────────────────
with tab2:
    for route in selected_routes:
        route_df = filtered[filtered["route_label"] == route]
        if route_df.empty:
            continue
        latest = route_df.sort_values("collected_at").groupby("flight_date").last().reset_index()
        fig = price_heatmap(latest, f"Calendário de preços — {route}")
        st.plotly_chart(fig, use_container_width=True)


# ── Tab 3: Comparar Rotas ────────────────────────────────────────────────────
with tab3:
    if dest_comparison:
        c = dest_comparison
        best_name = "Lisboa" if c["best"] == "LIS" else "Madrid"
        st.success(
            f"✈️ **Melhor escolha agora: {best_name}** — "
            f"Lisboa a partir de R$ {c['min_lis']:,} · Madrid a partir de R$ {c['min_mad']:,}"
        )

    # Painéis lado a lado
    col_lis, col_mad = st.columns(2)

    for col, dest_code, dest_name in [(col_lis, "LIS", "Lisboa"), (col_mad, "MAD", "Madrid")]:
        with col:
            st.subheader(f"✈️ Recife → {dest_name}")
            dest_df = filtered[
                (filtered["origin"] == "REC") & (filtered["destination"] == dest_code)
            ]
            if dest_df.empty:
                st.info(f"Sem dados para {dest_name}.")
                continue

            min_price = dest_df["price_brl"].min()
            st.metric("Menor preço atual", f"R$ {min_price:,.0f}")

            # Top 5 para este destino
            top_dest = top_cheapest_table(dest_df, df_full, n=5)
            if not top_dest.empty:
                mini = top_dest[["flight_date", "price_brl", "stops", "duration_fmt", "gf_link"]].rename(columns={
                    "flight_date": "Data",
                    "price_brl": "Preço (R$)",
                    "stops": "Paradas",
                    "duration_fmt": "Duração",
                    "gf_link": "Link",
                })
                st.dataframe(
                    mini,
                    column_config={
                        "Link": st.column_config.LinkColumn("Link", display_text="Abrir GF"),
                        "Preço (R$)": st.column_config.NumberColumn("Preço (R$)", format="R$ %.0f"),
                    },
                    hide_index=True,
                    use_container_width=True,
                )

    st.divider()

    # Gráfico comparativo N rotas
    rec_routes = {
        r: filtered[filtered["route_label"] == r]
        for r in selected_routes
        if r.startswith("REC→")
    }
    if rec_routes:
        fig_cmp = route_comparison_chart(rec_routes)
        st.plotly_chart(fig_cmp, use_container_width=True)

    st.divider()

    # ── Análise por duração de estadia ────────────────────────────────────────
    st.subheader("📆 Quanto tempo ficar? Preços por duração de estadia")
    st.caption("Baseado nos dados de ida+volta (roundtrip). Margem de ±3 dias em torno da duração alvo.")

    stay_options_all = [10, 15, 20, 25, 30, 45]
    selected_stays = st.multiselect(
        "Durações de estadia (dias)",
        stay_options_all,
        default=[15, 20, 25, 30],
        key="stay_options",
    )

    if selected_stays:
        stay_df = stay_duration_analysis(filtered, stay_options=sorted(selected_stays))

        if stay_df.empty:
            st.info(
                "Sem dados de roundtrip com datas de volta preenchidas. "
                "Os dados de roundtrip vêm do SerpAPI — verifique se está configurado no `.env`."
            )
        else:
            # Heatmap mês × duração
            pivot = stay_duration_pivot(stay_df)
            if not pivot.empty:
                st.plotly_chart(stay_duration_heatmap(pivot), use_container_width=True)

            # Tabela detalhada por duração selecionada
            stay_tab_labels = [f"{d} dias" for d in sorted(selected_stays)]
            stay_tabs = st.tabs(stay_tab_labels)

            for tab, target in zip(stay_tabs, sorted(selected_stays)):
                with tab:
                    subset = stay_df[stay_df["stay_target"] == target].sort_values("price_brl")
                    if subset.empty:
                        st.info(f"Sem opções para {target} dias de estadia.")
                        continue

                    display = subset[[
                        "flight_date", "return_date", "stay_days",
                        "route_label", "price_brl", "airline_fmt",
                        "stops", "duration_fmt", "gf_link",
                    ]].rename(columns={
                        "flight_date": "Ida",
                        "return_date": "Volta",
                        "stay_days": "Dias",
                        "route_label": "Rota",
                        "price_brl": "Preço (R$)",
                        "airline_fmt": "Cia",
                        "stops": "Paradas",
                        "duration_fmt": "Duração",
                        "gf_link": "Comprar",
                    })
                    st.dataframe(
                        display,
                        column_config={
                            "Comprar": st.column_config.LinkColumn("Comprar", display_text="Abrir GF"),
                            "Preço (R$)": st.column_config.NumberColumn("Preço (R$)", format="R$ %.0f"),
                        },
                        hide_index=True,
                        use_container_width=True,
                    )


# ── Tab 4: Histórico ─────────────────────────────────────────────────────────
with tab4:
    st.markdown("Acompanhe como o preço de um voo específico evoluiu ao longo das coletas.")

    route_for_trend = st.selectbox("Rota", selected_routes, key="hist_route")
    route_df_hist = filtered[filtered["route_label"] == route_for_trend]

    if not route_df_hist.empty:
        available_dates = sorted(route_df_hist["flight_date"].dt.date.unique())
        selected_flight_date = st.selectbox("Data do voo", available_dates, key="hist_date")
        fig = price_trend(route_df_hist, pd.Timestamp(selected_flight_date), route_for_trend)
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("Sem dados para a rota selecionada.")

    st.divider()

    for route in selected_routes:
        route_df = filtered[filtered["route_label"] == route]
        if route_df.empty:
            continue
        fig_sea = price_seasonality(route_df, route)
        st.plotly_chart(fig_sea, use_container_width=True)
