"""
Utilitário de gerenciamento de rotas via linha de comando.

Uso:
  python scripts/routes.py list
  python scripts/routes.py add REC MAD oneway
  python scripts/routes.py deactivate REC MAD
  python scripts/routes.py activate REC MAD
  python scripts/routes.py fetch REC MAD oneway
  python scripts/routes.py delete REC MAD oneway
"""
import sys
import os

# Permite rodar a partir da raiz do projeto
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db.connection import SessionLocal, init_db
from src.db.models import Route
from src.scheduler import fetch_and_store_route


def cmd_list():
    with SessionLocal() as s:
        routes = s.query(Route).order_by(Route.origin, Route.destination).all()
        if not routes:
            print("Nenhuma rota cadastrada.")
            return
        print(f"\n{'ID':<5} {'Origem':<8} {'Destino':<10} {'Tipo':<12} {'Ativa'}")
        print("-" * 45)
        for r in routes:
            status = "sim" if r.is_active else "nao"
            print(f"{r.id:<5} {r.origin:<8} {r.destination:<10} {r.trip_type:<12} {status}")
        print()


def cmd_add(origin: str, destination: str, trip_type: str):
    origin = origin.upper()
    destination = destination.upper()
    trip_type = trip_type.lower()

    if trip_type not in ("oneway", "roundtrip"):
        print("Erro: tipo deve ser 'oneway' ou 'roundtrip'.")
        sys.exit(1)

    with SessionLocal() as s:
        exists = s.query(Route).filter_by(
            origin=origin, destination=destination, trip_type=trip_type
        ).first()

        if exists:
            if exists.is_active:
                print(f"Rota {origin}→{destination} [{trip_type}] já existe e está ativa.")
            else:
                exists.is_active = True
                s.commit()
                print(f"Rota {origin}→{destination} [{trip_type}] reativada.")
        else:
            s.add(Route(origin=origin, destination=destination, trip_type=trip_type))
            s.commit()
            print(f"Rota {origin}→{destination} [{trip_type}] adicionada.")


def cmd_deactivate(origin: str, destination: str):
    origin = origin.upper()
    destination = destination.upper()

    with SessionLocal() as s:
        routes = s.query(Route).filter_by(origin=origin, destination=destination).all()
        if not routes:
            print(f"Nenhuma rota encontrada para {origin}→{destination}.")
            return
        for r in routes:
            r.is_active = False
        s.commit()
        print(f"Rota(s) {origin}→{destination} desativada(s).")


def cmd_activate(origin: str, destination: str):
    origin = origin.upper()
    destination = destination.upper()

    with SessionLocal() as s:
        routes = s.query(Route).filter_by(origin=origin, destination=destination).all()
        if not routes:
            print(f"Nenhuma rota encontrada para {origin}→{destination}.")
            return
        for r in routes:
            r.is_active = True
        s.commit()
        print(f"Rota(s) {origin}→{destination} ativada(s).")


def cmd_fetch(origin: str, destination: str, trip_type: str):
    origin = origin.upper()
    destination = destination.upper()
    trip_type = trip_type.lower()

    with SessionLocal() as s:
        route = s.query(Route).filter_by(
            origin=origin, destination=destination, trip_type=trip_type
        ).first()

        if not route:
            print(f"Rota {origin}→{destination} [{trip_type}] não encontrada. Use 'add' primeiro.")
            sys.exit(1)

        print(f"Coletando preços para {origin}→{destination} [{trip_type}]...")
        saved = fetch_and_store_route(route, s)
        print(f"Coleta concluída. {saved} snapshots salvos.")


def cmd_delete(origin: str, destination: str, trip_type: str):
    origin = origin.upper()
    destination = destination.upper()
    trip_type = trip_type.lower()

    with SessionLocal() as s:
        route = s.query(Route).filter_by(
            origin=origin, destination=destination, trip_type=trip_type
        ).first()

        if not route:
            print(f"Rota {origin}→{destination} [{trip_type}] não encontrada.")
            sys.exit(1)

        confirm = input(f"Deletar permanentemente {origin}→{destination} [{trip_type}] e todos os snapshots? [s/N] ")
        if confirm.lower() != "s":
            print("Cancelado.")
            return

        s.delete(route)
        s.commit()
        print(f"Rota {origin}→{destination} [{trip_type}] deletada.")


def usage():
    print(__doc__)
    sys.exit(1)


if __name__ == "__main__":
    args = sys.argv[1:]

    if not args:
        usage()

    command = args[0]

    if command == "list":
        cmd_list()

    elif command == "add":
        if len(args) != 4:
            print("Uso: python scripts/routes.py add <ORIGEM> <DESTINO> <oneway|roundtrip>")
            sys.exit(1)
        cmd_add(args[1], args[2], args[3])

    elif command == "deactivate":
        if len(args) != 3:
            print("Uso: python scripts/routes.py deactivate <ORIGEM> <DESTINO>")
            sys.exit(1)
        cmd_deactivate(args[1], args[2])

    elif command == "activate":
        if len(args) != 3:
            print("Uso: python scripts/routes.py activate <ORIGEM> <DESTINO>")
            sys.exit(1)
        cmd_activate(args[1], args[2])

    elif command == "fetch":
        if len(args) != 4:
            print("Uso: python scripts/routes.py fetch <ORIGEM> <DESTINO> <oneway|roundtrip>")
            sys.exit(1)
        cmd_fetch(args[1], args[2], args[3])

    elif command == "delete":
        if len(args) != 4:
            print("Uso: python scripts/routes.py delete <ORIGEM> <DESTINO> <oneway|roundtrip>")
            sys.exit(1)
        cmd_delete(args[1], args[2], args[3])

    else:
        print(f"Comando desconhecido: '{command}'")
        usage()
