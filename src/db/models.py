from datetime import datetime, date
from sqlalchemy import (
    Column, Integer, String, Numeric, Boolean, Date,
    DateTime, ForeignKey, UniqueConstraint, text
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Route(Base):
    __tablename__ = "routes"

    id = Column(Integer, primary_key=True)
    origin = Column(String(3), nullable=False)        # IATA (REC, LIS, BCN)
    destination = Column(String(3), nullable=False)
    trip_type = Column(String(10), nullable=False)    # 'oneway' | 'roundtrip'
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    snapshots = relationship("PriceSnapshot", back_populates="route")

    __table_args__ = (
        UniqueConstraint("origin", "destination", "trip_type", name="uq_route"),
    )

    def __repr__(self):
        return f"<Route {self.origin}→{self.destination} [{self.trip_type}]>"


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id = Column(Integer, primary_key=True)
    collected_at = Column(DateTime, nullable=False, default=datetime.utcnow)  # quando foi coletado
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    flight_date = Column(Date, nullable=False)         # data do voo de ida
    return_date = Column(Date)                         # data de volta (roundtrip)
    airline = Column(String(100))
    price_brl = Column(Numeric(10, 2))
    price_eur = Column(Numeric(10, 2))
    stops = Column(Integer, default=0)
    duration_minutes = Column(Integer)
    source = Column(String(20))                        # 'serpapi' | 'amadeus' | 'aviasales'

    route = relationship("Route", back_populates="snapshots")


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True)
    route_id = Column(Integer, ForeignKey("routes.id"), nullable=False)
    threshold_brl = Column(Numeric(10, 2))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    notified_at = Column(DateTime)
