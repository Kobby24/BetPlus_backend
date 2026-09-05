web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1
release: python -m app.db.migrate
worker: python -m app.workers.live_sync_worker
