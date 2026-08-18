# BetPlus Backend (FastAPI)

## Quick start

```bash
cd backend
cp .env.example .env
docker compose up --build
```

API: `http://localhost:8000`  
Health: `GET /health/`  
OpenAPI docs: `http://localhost:8000/docs`

## Environment

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL or SQLite connection string |
| `SECRET_KEY` | JWT signing secret (required in production) |
| `CORS_ORIGINS` | Comma-separated frontend origins |
| `SEED_DEMO_DATA` | `true`/`false` — seed sports, matches, demo admin |

## Migrations

```bash
cd backend
alembic upgrade head
```

## Tests

```bash
cd backend
py -m pytest tests/ -v
```

PostgreSQL concurrency tests are skipped unless `POSTGRES_TEST_URL` is set.

## Demo users (SEED_DEMO_DATA=true)

| Email | Password | Role |
|-------|----------|------|
| admin@betplus.com | admin123 | admin |
| demo@betplus.local | demo123 | admin |
| manager@betplus.local | manager123 | manager |


## API versioning

- Primary: `/api/v1/...`
- Legacy aliases: `/api/auth`, `/api/wallet`, `/api/bets`, `/api/catalog` (migration period)

## Frontend integration

Set in the Next.js app:

```env
NEXT_PUBLIC_USE_BACKEND=true
BACKEND_URL=http://localhost:8000
```

Next.js rewrites proxy `/api/v1/*` to the FastAPI backend.
