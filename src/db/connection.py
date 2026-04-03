import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

from .models import Base, Route

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:flighttracker@localhost:5432/flights")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Rotas padrão monitoradas
DEFAULT_ROUTES = [
    {"origin": "REC", "destination": "LIS", "trip_type": "oneway"},
    {"origin": "REC", "destination": "MAD", "trip_type": "oneway"},
    {"origin": "LIS", "destination": "REC", "trip_type": "oneway"},
    {"origin": "MAD", "destination": "REC", "trip_type": "oneway"},
    {"origin": "REC", "destination": "LIS", "trip_type": "roundtrip"},
    {"origin": "REC", "destination": "MAD", "trip_type": "roundtrip"},
]


def init_db():
    Base.metadata.create_all(engine)

    # Ativa extensão TimescaleDB se disponível
    with engine.connect() as conn:
        try:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;"))
            conn.commit()
            print("[DB] TimescaleDB ativado.")
        except Exception:
            print("[DB] TimescaleDB não disponível — usando PostgreSQL padrão.")

    # Insere rotas padrão se não existirem
    with SessionLocal() as session:
        for r in DEFAULT_ROUTES:
            exists = session.query(Route).filter_by(
                origin=r["origin"],
                destination=r["destination"],
                trip_type=r["trip_type"],
            ).first()
            if not exists:
                session.add(Route(**r))
        session.commit()
    print("[DB] Rotas configuradas.")


def get_session():
    return SessionLocal()
