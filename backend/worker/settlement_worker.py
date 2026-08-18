"""Simple settlement worker that runs continuously and logs passes."""

import time
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.settlement import run_settlement_pass


def main():
    print("Starting settlement worker...")
    while True:
        db: Session = SessionLocal()
        try:
            results = run_settlement_pass(db, limit=100)
            if results:
                print(f"Settled {len(results)} bets")
            time.sleep(5)
        except Exception as e:
            print("Worker error:", e)
            time.sleep(5)
        finally:
            db.close()


if __name__ == "__main__":
    main()
