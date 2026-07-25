# JHAX.ai Landing Page — SvelteKit (static / serverless)

A **fully static, serverless** SvelteKit port of the original FastAPI + React
JHAX.ai landing page. There is **no backend server and no SQL database**:

- **Free Audit** calls Google Places **from the browser** (Maps JavaScript API
  Places library) and runs the "What JHAX Found" heuristics **client-side** — same
  cards, same numbers as before.
- **Leads** (both forms) are written straight to **Firebase Firestore** from the
  browser (project `jhax-coo`).

The build output in `build/` is plain static files — host it anywhere.

## Run

```bash
npm install
cp .env.example .env      # fill PUBLIC_* values (see below)
npm run dev               # http://localhost:5173
npm run build             # -> ./build (static SPA)
npm run preview           # serve the static build locally
npm run check             # svelte-check (0 errors, 0 warnings)
npm run parity            # heuristics still byte-identical to the original Python
```

## Environment (all `PUBLIC_`, inlined into the browser bundle)

```
PUBLIC_AUDIT_DATA_SOURCE=google        # or "osm" (free, no key)
PUBLIC_GOOGLE_PLACES_API_KEY=...        # Maps JS API + Places API (New), referrer-restricted
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=jhax-coo.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=jhax-coo
PUBLIC_FIREBASE_APP_ID=...
```

## One-time cloud setup

**Google Places key** (Google Cloud console): enable **Maps JavaScript API** +
**Places API (New)** on the key, then restrict it to your site's HTTP referrers.
(Places REST endpoints don't allow browser CORS — that's why we use the Maps JS
library.)

**Firestore** (Firebase console → project `jhax-coo`):
1. Firestore Database → **Create database** (Production mode).
2. Deploy the security rules in `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```
   Rules: the `leads` collection is **write-only** for clients (no read/update/
   delete), with required-field validation to block empty/spam submissions.

## Deploy (simplest — fully static)

Because there's no server, any static host works (Netlify, Vercel, GitHub Pages,
Cloud Storage, S3, …) — just serve `build/` with an SPA fallback to `index.html`.

**Firebase Hosting** (same `jhax-coo` project, one command set):
```bash
npm run build
firebase login
firebase deploy --only hosting,firestore:rules
```
`firebase.json` already points hosting at `build/` with the SPA rewrite, and
`.firebaserc` targets `jhax-coo`.

## Data model — Firestore `leads`

Same fields the old `/api/leads` stored (nothing dropped):
`email`, `source`, `business_name`, `person_name`, `phone`, `created_at`
(`created_at` = Firestore server timestamp). `source` is `final_cta` (footer form)
or `audit_report_download` (audit PDF gate).

See `MIGRATION.md` for the full before/after mapping.
