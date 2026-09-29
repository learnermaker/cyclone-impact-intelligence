# Cyclone Impact Intelligence & Action Engine

**Code for Communities 2.0 — Cyclone Track**

> An AI-assisted decision engine that converts cyclone hazard forecasts into localized impact intelligence, infrastructure-aware response priorities, explainable advisories, and historical replay evaluation.

---

## What it does

```
Cyclone forecast
  → Hazard engine (wind / rainfall / surge — flood-fill BFS preferred)
  → Exposure engine (population / buildings / roads / critical assets)
  → Susceptibility (elevation-based flood susceptibility / terrain)
  → Impact exposure = hazard × exposure × susceptibility
  → Infrastructure criticality + dependency centrality (H3 spatial proxy)
  → Priority optimizer (greedy top-K, response-capacity controlled)
  → Advisory (structured + Gemini-assisted or deterministic fallback)
  → Parametric liquidity indicator (illustrative)
  → Historical replay + evaluation metrics (Copernicus EMSR357 when available)
```

**Core operational question:**
> Given an approaching cyclone and limited response capacity, which infrastructure and communities should be acted on first, and why?

---

## Quick Start

**Prerequisites:** Node.js ≥ 22, pnpm ≥ 9

```bash
# Install
pnpm install

# Generate the Fani demo fixture (required for offline demo)
pnpm generate:fixture

# Configure (only GEMINI_API_KEY needed for AI features)
cp .env.example .env.local

# Run development server
pnpm dev
# → Open http://localhost:3000 (redirects to Fani Replay)
```

The app works **without** a Gemini API key — all features use the deterministic fallback.

---

## Primary Demo: Fani 2019 Replay

Navigate to **REPLAY** mode (default landing page):

1. **T-24h prediction** — load pre-event reconstruction
2. **Map** — combined hazard, surge exposure, infrastructure overlay
3. **Priorities** — top-10 interventions with evidence
4. **Why #1?** — Gemini or deterministic explanation
5. **Scenario sliders** — adjust wind/rain/surge, watch priorities update
6. **Generate Advisory** — structured evidence-backed advisory
7. **Approve** — human approval required (no autonomous dispatch)
8. **Simulated Dispatch** — sends to local webhook
9. **Insurance panel** — illustrative parametric trigger (DEMO ONLY)
10. **Reveal Actual Impact** — unlocks post-event data
11. **Evaluation** — metrics vs Copernicus evidence (or honest metricsUnavailableReason)

---

## Commands

```bash
pnpm dev              # Development server (port 3000)
pnpm build            # Production build (Next.js standalone)
pnpm start            # Start production server
pnpm test             # Run unit + integration tests (Vitest)
pnpm test:e2e         # Run E2E golden-path tests (Playwright)
pnpm generate:fixture # Generate Fani demo fixture
pnpm type-check       # TypeScript check without emitting
pnpm lint             # ESLint
```

---

## Architecture

Single Next.js 16 application on Google Cloud Run. No database required.

```
src/
├── app/
│   ├── app/{live,impact,action,replay}/  ← 4 operator modes
│   └── api/{events,impact,priorities,assets,explain,
│           advisory,insurance,scenario,replay,gemini,
│           health,webhook}/              ← server-only API routes
├── engine/
│   ├── hazard/       ← wind/rain/surge normalization, flood-fill BFS
│   ├── exposure/     ← H3 aggregation
│   ├── susceptibility/ ← elevation/terrain (NOT generic vulnerability)
│   ├── impact/       ← hazard × exposure × susceptibility
│   ├── infrastructure/ ← H3 cell correlation, asset risk
│   ├── priority/     ← greedy top-K, H3 overlap guard
│   ├── advisory/     ← in-memory advisory lifecycle
│   ├── insurance/    ← parametric trigger evaluation
│   ├── evaluation/   ← replay metrics + DEMO_FIXTURE firewall
│   ├── loader/       ← server-only fixture cache (MAX 4,000 cells/response)
│   └── runner.ts     ← main pipeline entry point
├── gemini/
│   ├── client.ts     ← @google/genai, 4-iteration function-calling, fallback
│   ├── tools/        ← 9 deterministic tool definitions + executors
│   └── prompts/      ← system prompt with numerical integrity constraints
├── components/
│   ├── map/          ← MapLibre v6 (dynamic import, ssr:false)
│   ├── priority/     ← PriorityCard, PriorityList
│   ├── advisory/     ← AdvisoryPanel (full approval workflow)
│   ├── scenario/     ← ScenarioControls (sliders)
│   ├── insurance/    ← InsurancePanel
│   ├── replay/       ← ReplayControls (state machine)
│   └── shared/       ← SourceTierBadge, ConfidenceBar
└── store/            ← Zustand (UI/session state only)

data/
├── fixtures/fani-demo/  ← synthetic demo fixture (committed)
├── historical/fani/
│   ├── prediction/   ← pre-event data (committed)
│   └── actual/       ← post-event Copernicus (gitignored, separate pipeline)
└── processed/        ← GEE-derived compact assets (committed when available)
```

**Key architectural constraints:**
- `h3-js` is server-only (via `serverExternalPackages`)
- API responses are viewport/bbox filtered — never 43k cells at once
- DEMO_FIXTURE data cannot produce claimed historical accuracy metrics (Zod-enforced)
- Gemini cannot change risk scores or override rankings
- Advisory dispatch requires explicit human APPROVED status

---

## Modes

| Mode | Description |
|---|---|
| **LIVE** | Active event monitoring. Honest empty state if no cyclone. |
| **IMPACT** | 7-layer map (wind/rain/surge/combined/population/impact/priority) + cell detail |
| **ACTION** | Priority cards + scenario controls + advisory workflow + insurance panel |
| **REPLAY** | Fani 2019 T-24h — 7-phase state machine with information firewall |

---

## Data Sources

| Dataset | Purpose | License | Status |
|---|---|---|---|
| IMD RSMC archive | Track/intensity parameters | Official | Parameters documented |
| WorldPop 2019 | Population exposure | CC BY 4.0 | Fixture synthetic; real pipeline in `pipelines/worldpop/` |
| OpenStreetMap Jan 2019 | Infrastructure | ODbL 1.0 | Curated subset (15 assets); full pipeline in `pipelines/osm/` |
| NASADEM | Elevation/terrain | Public domain | Fixture synthetic; GEE pipeline in `pipelines/gee/` |
| GPM IMERG | Event rainfall | Public domain | Fixture synthetic |
| Copernicus EMS EMSR357 | Actual validation | Copernicus terms | Post-event only; pipeline in `pipelines/copernicus/` |
| GDACS | Live events | GDACS terms | Phase 9 (live adapters) |
| Open-Meteo/ECMWF | Meteorological fallback | CC BY 4.0 | Phase 9 |

See [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for full attribution.  
See [`docs/DATA_PREP.md`](docs/DATA_PREP.md) for pipeline documentation.

---

## Gemini Integration

- **Model**: `gemini-3.7-flash` (configurable via `GEMINI_MODEL`)
- **SDK**: `@google/genai` v2
- **Pattern**: 9 deterministic function-calling tools + 4-iteration loop
- **Fallback**: deterministic explanation from `buildDeterministicExplanation()` — always available
- **Constraint**: Gemini cannot modify risk scores, rankings, or invent evidence

```bash
# Test Gemini (requires GEMINI_API_KEY in .env.local)
curl -X POST http://localhost:3000/api/gemini/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Why is the top priority cell so important?"}'

# Fallback test (no key needed)
GEMINI_API_KEY= curl -X POST http://localhost:3000/api/gemini/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Explain the Fani replay priorities"}'
```

---

## Limitations

This is a **decision-support prototype**, not an operational system.

- Not an official warning service (not replacing IMD/INCOIS)
- Not structural engineering (risk = disruption exposure, not failure probability)
- Not an operational hydrodynamic surge model (bathtub screening only)
- Not autonomous emergency dispatch (human approval required)
- Not a real insurance platform (illustrative parametric concept only)
- Infrastructure inventory is incomplete ("mapped assets in available datasets")
- Surge proximity threshold (25 km) is a configurable screening approximation, not a validated boundary
- Synthetic fixture does not reproduce actual Fani measurements

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for full detail.

---

## Deployment

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for:
- Docker build and run
- Cloud Run deployment
- Secret management
- Demo reliability checklist

---

## Tests

```
Tests: 116 unit + integration (Vitest)
E2E:   14 golden-path tests (Playwright)

pnpm test          # 116 Vitest tests
pnpm test:e2e      # 14 Playwright tests (requires running server)
```

---

## Build Phases

| Phase | Status | Description |
|---|---|---|
| 1 | ✅ VERIFIED | Skeleton, contracts, schemas, config, app shell |
| 2 | ✅ VERIFIED | Fani demo fixture (43,009 H3 cells generated + committed) |
| 3 | ✅ VERIFIED | Deterministic engine (hazard→priority) + 116 tests |
| 4 | ✅ VERIFIED | Advisory, insurance, evaluation engines |
| 5 | ✅ VERIFIED | All API routes (events, impact, priorities, advisory, insurance, scenario, replay, gemini, assets, explain, webhook, health) |
| 6 | ✅ VERIFIED | Gemini integration (9 function-calling tools + text-only retry + deterministic fallback) |
| 7 | ✅ VERIFIED | Complete UI (4 modes + MapLibre v6 + all components) |
| 8 | ✅ VERIFIED | Dockerfile (standalone, node:22-alpine) |
| 9 | ✅ VERIFIED | Live adapters: GDACS + Open-Meteo (graceful fallback, no credentials required) |
| E2E | ✅ VERIFIED | 14/14 Playwright golden-path tests pass |
| GEE data | ⬜ CREDENTIAL-DEPENDENT | GEE pipeline scripts written; real data requires Earth Engine registration |
| Copernicus actual | ⬜ MANUAL-DOWNLOAD | EMSR357 data publicly available; requires manual download from copernicus.eu |

**Primary demo works offline at any point from Phase 3 onward.**

## Gemini Model Note

The default model is `gemini-3.7-flash` (supports function calling). If you use a smaller model
like `gemini-3.1-flash-lite`, function calling may fail with a `thought_signature` error —
the client retries automatically in text-only mode. For best results, use `gemini-3.7-flash`.

```bash
# In .env.local:
GEMINI_MODEL=gemini-3.7-flash   # recommended
# GEMINI_MODEL=gemini-3.1-flash-lite  # works but no function calling
```
