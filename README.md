# BetPlus Frontend

## Development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Backend mode (recommended)

Set in `.env.local`:

```
NEXT_PUBLIC_USE_BACKEND=true
BACKEND_URL=http://localhost:8000
```

Start FastAPI first (`backend/README.md`), then Next.js.

In backend mode, authentication, wallet, bets, settlement, admin, manager, referrals, and the platform ledger are served by FastAPI. The JWT is stored in the browser only as a session token.

## Admin portal

```bash
npm run dev:admin
```

Uses `ADMIN_ONLY=true`. Sign in with a FastAPI admin user (`admin@betplus.com` / `admin123` when demo seed is enabled) or the `ADMIN_EMAIL` / `ADMIN_PASSWORD` env fallback.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Public betting app |
| `npm run dev:admin` | Admin-only portal |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm start` | Serve production build |
