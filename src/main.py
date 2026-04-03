"""
Flight Price Tracker — Entry Point

Uso:
  python -m src.main --once       # Roda uma coleta agora (teste)
  python -m src.main              # Inicia scheduler (roda às 6h todo dia)
  python -m src.main --init-only  # Apenas inicializa o banco e sai
"""
import sys
import time
from apscheduler.schedulers.blocking import BlockingScheduler

from .db.connection import init_db
from .scheduler import run_daily_fetch


def main():
    init_db()

    args = sys.argv[1:]

    if "--init-only" in args:
        print("Banco inicializado.")
        return

    if "--once" in args:
        run_daily_fetch()
        return

    # Modo contínuo: scheduler às 6h todo dia
    scheduler = BlockingScheduler()
    scheduler.add_job(run_daily_fetch, "cron", hour=6, minute=0, id="daily_fetch")
    print("Scheduler iniciado. Coleta diária às 06:00. Ctrl+C para parar.")

    # Roda uma vez imediatamente ao iniciar (para não esperar até amanhã)
    run_daily_fetch()

    try:
        scheduler.start()
    except KeyboardInterrupt:
        print("\nScheduler encerrado.")


if __name__ == "__main__":
    main()
