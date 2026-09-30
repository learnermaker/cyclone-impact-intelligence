# Cyclone Impact Intelligence & Action Engine

**Code for Communities 2.0 — Cyclone Track**

> A decision-support engine that converts cyclone hazard forecasts into
> localized impact intelligence, infrastructure-aware response priorities,
> explainable advisories, and historical replay evaluation.

---

## What it answers

> Given an approaching cyclone and limited response capacity, which
> communities and infrastructure should be acted on first, and why?

---

## Quick Start

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 9

```bash
# Install (automatically copies MapLibre worker files to public/)
pnpm install

# Configure — only GEMINI_API_KEY is needed for AI features
cp .env.example .env.local

# Run development server
pnpm dev
# → Open http://localhost:3000 (defaults to Fani 2019 Replay)
```

The fixture is pre-committed. No GEE credentials are needed to run the demo.
The app works fully without a Gemini API key — deterministic fallback activates automatically.

---

## Three-Minute Demo Path

Open **REPLAY** → T-24h prediction → **IMPACT** → toggle 7 analytical layers →
**ACTION** → change capacity K → Why explanation → generate advisory → approve →
simulated dispatch → **REVEAL** → Sentinel-1 proxy → evaluation metrics.

---

## Modes

| Mode | Description |
|------|-------------|
| **LIVE** | Active event monitoring. Honest empty state when no cyclone is detected. |
| **IMPACT** | 7-layer analytical map: Combined Hazard, Wind, Rainfall, Surge, Population, Impact Exposure, Priority |
| **ACTION** | Priority cards + scenario controls + advisory workflow + insurance panel |
| **REPLAY** | Fani 2019 T-24h — 7-phase state machine with information firewall |

---

## Data Sources — Actual Status

| Dataset | Dataset ID | Purpose | License | Status |
|---------|-----------|---------|---------|--------|
| WorldPop 2019 | `WorldPop/GP/100m/pop` | Population exposure | CC BY 4.0 | ✅ GEE-executed, integrated |
| NASADEM | `NASA/NASADEM_HGT/001` | Terrain / susceptibility | Public domain (NASA) | ✅ GEE-executed, integrated |
| GPM IMERG | `NASA/GPM_L3/IMERG_V07` | Fani event rainfall | Public domain (NASA) | ✅ GEE-executed, reveal-only |
| Sentinel-1 GRD | `COPERNICUS/S1_GRD` | Post-event inundation proxy | Copernicus/ESA | ✅ GEE-executed, reveal-only |
| OpenStreetMap | Jan 2019 extract | 15 curated infrastructure assets | ODbL 1.0 | ⚠️ Curated subset (incomplete) |
| Open Buildings | `GOOGLE/Research/open-buildings-temporal/v1` | Building exposure | CC BY 4.0 | ❌ Not integrated (S2-tile access blocker) |
| Copernicus EMSR357 | EMS activation | Post-event validation | Copernicus terms | ❌ Manual download required |
| GDACS | GDACS API | Live cyclone detection | GDACS terms | ✅ Live adapter (no key needed) |
| Open-Meteo / ECMWF | ECMWF IFS | Meteorological context | CC BY 4.0 | ✅ Live adapter (no key needed) |
| IMD RSMC | Official archive | Fani track parameters | Official | ✅ Parameters documented in fixture |

> **WorldPop + NASADEM** are used in the T-24h prediction path (prediction-safe).  
> **GPM + Sentinel-1** are accessible only after an explicit REVEAL step (temporal firewall).  
> **Buildings/roads** remain synthetic, clearly labelled DEMO_FIXTURE.

Full pipeline documentation: [`pipelines/gee/README.md`](pipelines/gee/README.md)

---

## Pipeline

```
Cyclone forecast
  → Hazard (wind 0.40 / rainfall 0.30 / surge 0.30 — flood-fill BFS preferred)
  → Exposure (population 0.35 / buildings 0.25 / roads 0.15 / critical 0.25)
  → Susceptibility (NASADEM elevation → flood susceptibility function)
  → Impact = hazard × exposure × susceptibility
  → Infrastructure criticality + spatial dependency centrality
  → Greedy top-K priority optimizer (response-capacity constrained)
  → Advisory → human approval → simulated dispatch
  → Parametric liquidity indicator (ILLUSTRATIVE POLICY only)
  → Replay → reveal → evaluation (precisionAtK / population-weighted capture)
```

All weights are policy/model parameters, not universal constants.

---

## Test Matrix

| Suite | Count | Command |
|-------|-------|---------|
| Vitest (unit + integration) | **198** | `pnpm test` |
| Playwright E2E | **14** | `pnpm test:e2e` |
| TypeScript | 0 errors | `pnpm type-check` |
| Production build | PASS | `pnpm build` |

---

## Commands

```bash
pnpm dev              # Development server (port 3000, Turbopack)
pnpm build            # Production build (Next.js standalone)
pnpm start            # Start production server (port 3000)
pnpm test             # 198 Vitest tests
pnpm test:e2e         # 14 Playwright E2E tests (requires running server)
pnpm type-check       # TypeScript without emitting
pnpm lint             # ESLint
pnpm copy:worker      # Re-copy MapLibre worker to public/ (auto-runs on pnpm install)
```

---

## Architecture

Single Next.js 16 application. One container. Cloud Run target. No database.

```
src/
├── app/
│   ├── app/{live,impact,action,replay}/  ← 4 operator modes
│   └── api/…                             ← server-only API routes
├── engine/                               ← deterministic analytical engine
├── gemini/                               ← Gemini client + 9 tools + fallback
├── components/map/                       ← MapLibre v6 (setWorkerUrl fixed)
└── data-layer/                           ← DataSource registry + TemporalFirewall

data/
├── fixtures/fani-demo/        ← committed synthetic fixture (43,009 H3 cells)
├── processed/                 ← GEE-derived compact assets (committed)
└── historical/fani/actual/    ← Sentinel-1 post-event data (committed)
```

**Key constraints:**
- `h3-js` server-only via `serverExternalPackages`
- Viewport/bbox filtering — never more than 4,000 cells per API response
- DEMO_FIXTURE data cannot generate claimed accuracy metrics (Zod-enforced)
- Gemini cannot modify risk scores or override rankings
- Advisory dispatch requires explicit human APPROVED status

---

## Gemini Integration

- **Required model**: `gemini-3.7-flash` (function calling)
- **SDK**: `@google/genai` v2
- **Pattern**: 9 deterministic tools + 4-iteration function-calling loop
- **Fallback**: `buildDeterministicExplanation()` — always available without key
- **Text-only retry**: activates when model doesn't support function calling
- **Constraint**: Gemini cannot alter risk scores, rankings, or invent evidence

Set `GEMINI_MODEL=gemini-3.7-flash` in `.env.local` for full function calling support.

---

## MapLibre v6 Worker

MapLibre v6 requires an explicit `setWorkerUrl` call in bundled (Next.js/Turbopack) environments.
Without it, vector tiles load but GeoJSON layers silently fail. Fixed by:

```
setWorkerUrl("/maplibre-gl-worker.mjs")
```

Worker files are copied to `public/` automatically by `pnpm install` (`postinstall` script).
Do not remove `public/maplibre-gl-worker.mjs` or `public/maplibre-gl-shared.mjs`.

---

## Limitations

This is a **decision-support prototype**, not an operational system.

- Not an official warning service
- Not structural failure prediction (risk = disruption exposure)
- Not a hydrodynamic surge model (bathtub flood-fill screening only)
- Not autonomous dispatch (human approval required)
- Not a real insurance contract (ILLUSTRATIVE POLICY only)
- Infrastructure inventory is 15 curated assets — incomplete
- Buildings/roads exposure uses synthetic counts — Open Buildings not integrated
- Sentinel-1 is an observed inundation proxy, not flood-depth ground truth
- GPM 96h rainfall window crosses T-24h prediction cutoff — used for replay evaluation only, never for prediction

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for full detail.

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for Docker, Cloud Run, and secret management.
Cloud Run target: `asia-south1`.

---

## Licenses

See [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for full data attribution.
