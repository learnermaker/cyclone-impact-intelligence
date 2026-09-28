# Cyclone Impact Intelligence & Action Engine

**Code for Communities 2.0 — Cyclone Track**

> An AI-assisted decision engine that converts cyclone hazard forecasts into
> localized impact intelligence, infrastructure-aware response priorities,
> explainable advisories, and historical replay evaluation.

---

## What it does

```
Cyclone forecast
    ↓ Hazard engine (wind / rainfall / surge)
    ↓ Exposure engine (population / buildings / roads / assets)
    ↓ Susceptibility (elevation / coastal connectivity / terrain)
    ↓ Impact exposure = hazard × exposure × susceptibility
    ↓ Infrastructure criticality + dependency centrality
    ↓ Priority optimizer (greedy top-K, response-capacity controlled)
    ↓ Advisory (structured + Gemini-assisted language)
    ↓ Parametric liquidity indicator (illustrative)
    ↓ Historical replay + evaluation metrics
```

The core operational question this answers:

> **Given an approaching cyclone and limited response capacity, which
> infrastructure and communities should be acted on first, and why?**

---

## Primary demo

**Cyclone Fani 2019 — Odisha coastal corridor — T−24h replay**

From a clean checkout with zero external APIs:
1. Load the Fani demo fixture (T−24h reconstruction)
2. Run hazard → exposure → impact → priority
3. Inspect top-K recommendations and evidence
4. Ask "Why is this priority #2?" (Gemini or deterministic fallback)
5. Adjust response capacity and scenario parameters
6. Generate and approve a structured advisory
7. Click **Reveal Actual Impact**
8. Compute evaluation metrics vs Copernicus EMSR357 validation data

---

## Modes

| Mode | Description |
|------|-------------|
| LIVE | Active event monitoring (empty state if no cyclone) |
| IMPACT | Hazard × exposure × susceptibility map with cell detail |
| ACTION | Priority cards, scenario controls, advisory workflow, insurance panel |
| REPLAY | Fani 2019 step-through with prediction/actual information firewall |

---

## Quick start

### Prerequisites

- Node.js ≥ 22 (`node --version`)
- pnpm ≥ 9 (`npm install -g pnpm`)
- Docker (for containerized deployment)

### Local development

```bash
# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local — only GEMINI_API_KEY is needed for full functionality.
# All other variables have working defaults.

# Type-check
pnpm type-check

# Run tests
pnpm test

# Start development server
pnpm dev
```

Open http://localhost:3000 — redirects to `/app/replay`.

### Run Fani replay (offline)

```bash
pnpm replay:fani
```

This runs the Fani demo fixture through the engine and prints the top-K
recommendations to stdout. No network access required.

### Validate fixture schemas

```bash
pnpm validate:fixture
```

---

## Environment variables

See [`.env.example`](.env.example) for all variables and documentation.

Only `GEMINI_API_KEY` is needed for full AI-assisted explanation.
The app degrades gracefully (deterministic fallback) without it.

---

## Architecture

Single Next.js application deployed to Google Cloud Run.
No database. No runtime GEE dependency.

```
src/
├── app/           Next.js App Router (4 modes)
├── engine/        Deterministic hazard/exposure/impact/priority engine
├── gemini/        Gemini tools, function calling, prompts, fallback
├── adapters/      Live data adapters (GDACS, Open-Meteo, IMD)
├── evaluation/    Replay harness, metrics, baselines
├── components/    React UI components
├── store/         Zustand client state
├── lib/
│   ├── types/     Canonical TypeScript contracts
│   └── schemas/   Zod runtime validation
└── config/        Engine weights, thresholds, AOI bounds

data/
├── processed/     Compact GEE-derived assets (committed)
├── historical/
│   └── fani/
│       ├── prediction/   Pre-event fixture (committed)
│       └── actual/       Post-event validation — NOT committed
└── fixtures/
    └── fani-demo/  Synthetic demo fixture (committed, labelled)

pipelines/
├── gee/       GEE preprocessing scripts
├── osm/       OSM 2019 extraction
├── worldpop/  WorldPop aggregation
└── copernicus/ EMSR357 actual impact processing
```

---

## Data sources

| Source | Purpose | License |
|--------|---------|---------|
| IMD RSMC | Track and intensity | Official |
| WorldPop 2019 | Population exposure | CC BY 4.0 |
| OpenStreetMap (Jan 2019) | Infrastructure | ODbL 1.0 |
| Open Buildings 2019 | Building exposure | CC BY 4.0 |
| NASADEM | Elevation / surge screening | Public domain |
| GPM IMERG | Event rainfall | Public domain |
| Copernicus EMS EMSR357 | Post-event validation | Copernicus terms |
| GDACS | Live event normalization | GDACS terms |
| Open-Meteo / ECMWF | Meteorological fallback | CC BY 4.0 |

See [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for full attribution.

---

## Limitations

This is a **decision-support prototype**, not an operational system.

- Not an official warning service
- Not structural engineering (risk = disruption exposure, not failure probability)
- Not an operational hydrodynamic surge model (bathtub screening only)
- Not autonomous emergency dispatch (human approval required)
- Not a real insurance platform (illustrative policy only)

See [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for full detail.

---

## Build phases

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Complete | Skeleton, contracts, schemas, config, app shell |
| 2 | ⬜ Next | Fani demo fixture, data structures |
| 3 | ⬜ | Deterministic engine implementation |
| 4 | ⬜ | Fani replay state machine |
| 5 | ⬜ | API routes |
| 6 | ⬜ | Map UI + layer controls |
| 7 | ⬜ | Action + advisory + insurance UI |
| 8 | ⬜ | Gemini function calling |
| 9 | ⬜ | Live adapters (GDACS, Open-Meteo) |
| 10 | ⬜ | Docker + Cloud Run deployment |
| 11 | ⬜ | Failure injection + QA |

---

## Deployment

```bash
docker build -t cyclone-impact-intelligence .
docker run -p 3000:3000 cyclone-impact-intelligence
```

Cloud Run deployment documented in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).
