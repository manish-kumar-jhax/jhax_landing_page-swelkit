# JHAX.ai Landing Page — SvelteKit

A complete SvelteKit port of the original **FastAPI (Python) + React (CRA)** JHAX.ai
landing page, with **100% feature parity**. Frontend and backend are now a single
deployable **adapter-node** app: the former FastAPI endpoints live as SvelteKit
`/api/*` server routes.

This is a brand-new project — the original in `../jhax_landing_page` is untouched.

## Stack

| Concern | Original | This port |
|---|---|---|
| Framework | React 19 + CRACO | SvelteKit 2 (Svelte 5 runes) |
| Backend | FastAPI (Python) | SvelteKit server routes (`+server.js`) |
| DB driver | SQLAlchemy async + asyncpg | postgres.js |
| Icons | lucide-react | lucide-svelte |
| Animation | framer-motion | Svelte transitions + `reveal` action + `motion.js` |
| Smooth scroll | Lenis | Lenis (unchanged) |
| PDF export | html2pdf.js | html2pdf.js (unchanged, client-side) |
| Deploy | 2 services (Vercel + Render) | 1 Node app (adapter-node) |

## Run

```bash
npm install
cp .env.example .env      # then fill DATABASE_URL etc.
npm run dev               # dev server (http://localhost:5173)
npm run build && npm start # production (node build)
```

### Scripts
- `npm run dev` — dev server
- `npm run build` — production build (adapter-node → `build/`)
- `npm start` — run the production build (`node build`)
- `npm run check` — `svelte-check` type-check (0 errors, 0 warnings)
- `npm run parity` — **calculation parity test**: runs the ORIGINAL Python
  heuristics against this port over 80k+ inputs and asserts byte-identical output

## Environment

Same variables as the original `backend/.env`:

- `DATABASE_URL` — Postgres connection (leads + status_checks tables auto-created)
- `CORS_ORIGINS` — comma-separated allow-list, default `*`
- `AUDIT_DATA_SOURCE` — `osm` (default, free) or `google`
- `GOOGLE_PLACES_API_KEY` — required when `AUDIT_DATA_SOURCE=google`
- `NOMINATIM_USER_AGENT` — optional OSM User-Agent override

Only `/api/leads` and `/api/status` need a database. `/api/audit` does not.

## API (parity with the FastAPI backend)

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api` | `{ "message": "JHAX.ai API" }` |
| POST/GET | `/api/status` | create / list status checks |
| POST/GET | `/api/leads` | capture / list leads (newest first) |
| POST | `/api/audit` | free restaurant audit (provider + heuristics) |

Error bodies use FastAPI's `{ "detail": ... }` shape.

See `MIGRATION.md` for the exhaustive file-by-file mapping and decisions.
