# Cyclone Impact Intelligence & Action Engine

**Code for Communities 2.0 — Cyclone / Resilience Track**

---

## 1. Problem

Cyclone forecasting tells operators *where* the storm is going.
The harder operational question is **which communities and infrastructure to act on first**
when response capacity is constrained — and *why*.

A typical municipal disaster-management authority may be able to pre-position a limited number
of teams or issue a limited number of advisory communications. With thousands of potentially
affected H3 cells across a coastal corridor, the decision of *where* to act is not obvious
from a hazard map alone.

---

## 2. Solution

**Cyclone Impact Intelligence** turns cyclone forecasts and Earth Engine spatial data into
constrained, infrastructure-aware, explainable response priorities.

The engine combines:

| Component | Method |
|-----------|--------|
| Wind hazard | Normalized Fani IMD track parameters |
| Rainfall hazard | Open-Meteo ECMWF forecast (live) / GPM event observation (reveal only) |
| Surge hazard | Coastal flood-fill BFS from coastline (screening approximation) |
| Exposure | WorldPop 2019 population + synthetic buildings/roads |
| Terrain susceptibility | NASADEM elevation → flood susceptibility function |
| Impact | `hazard × exposure × susceptibility` |
| Infrastructure risk | `AssetRisk = HazardExposure × Vulnerability × Criticality × DependencyCentrality` |
| Priority optimizer | Deterministic greedy top-K with H3 spatial overlap guard |
| Advisory | Structured evidence-backed advisory + human approval gate |
| Insurance | Illustrative parametric liquidity indicator |
| Evaluation | Prediction vs Sentinel-1 observed inundation proxy |

---

## 3. Why This Is Different

- **GEE preprocessing**: WorldPop 2019, NASADEM, GPM IMERG, and Sentinel-1 SAR are all preprocessed via Earth Engine and committed as compact H3-compatible JSON. The runtime app has zero GEE dependency.
- **Temporal firewall**: GPM rainfall observation and Sentinel-1 flood proxy are code-enforced to be inaccessible during the T-24h prediction phase. They can only be loaded after an explicit REVEAL step.
- **Gemini as explanation, not authority**: Gemini 3.8 Flash calls 9 deterministic tools to retrieve evidence. It cannot modify risk scores, rankings, or invent data. All numbers come from the deterministic engine.
- **Human approval required**: Advisory dispatch is gated behind an explicit operator APPROVED status. Autonomous dispatch is architecturally prevented.
- **Honest coverage labelling**: The platform shows "GEE ENRICHED · MIXED COVERAGE" with the actual percentage (~30% of AOI land cells have real GEE data). The remaining cells use clearly-labelled synthetic fallback.

---

## 4. Architecture

```
Single Next.js 16 application / Single container / Cloud Run target
No database / No runtime GEE dependency

Browser (MapLibre v6 + React 19)
   ↕
Next.js Server Routes (TypeScript, Zod schemas)
   ↕
Deterministic Engine (H3-js, no ML)
   ↕  
GEE-preprocessed JSON assets (committed, server-only)
   ↕
Gemini 3.8 Flash (explanation layer only, server-side key)
   ↕
Live adapters: GDACS, Open-Meteo/ECMWF (optional, fallback-safe)
```

---

## 5. GEE Datasets

| Dataset | GEE ID | Role | Prediction-safe | Status |
|---------|--------|------|:-:|--------|
| WorldPop 2019 | `WorldPop/GP/100m/pop` | Population exposure | ✅ | Executed, integrated |
| NASADEM | `NASA/NASADEM_HGT/001` | Terrain/susceptibility | ✅ | Executed, integrated |
| GPM IMERG | `NASA/GPM_L3/IMERG_V07` | Fani event rainfall | ❌ (reveal-only) | Executed, reveal/eval only |
| Sentinel-1 GRD | `COPERNICUS/S1_GRD` | Post-event flood proxy | ❌ (reveal-only) | Executed, reveal/eval only |
| Open Buildings | `GOOGLE/Research/open-buildings-temporal/v1` | Building exposure | ✅ | NOT INTEGRATED (S2-tile blocker) |
| Copernicus EMSR357 | EMS activation | Validation | ❌ | NOT INTEGRATED (manual download required) |

GEE coverage: ~30% of AOI coastal land cells have real WorldPop/NASADEM data.
Remaining cells use synthetic DEMO_FIXTURE baseline (clearly labelled).

---

## 6. Gemini 3.8 Integration

- **Model**: `gemini-3.8-flash` (required for function calling)
- **SDK**: `@google/genai` v2
- **Pattern**: 9 deterministic function-calling tools, 4-iteration loop
- **Tools**: `get_event_status`, `get_cell_risk`, `get_asset_risk`, `get_priority_list`, `get_dependency_graph`, `run_scenario`, `get_historical_replay`, `generate_advisory`, `evaluate_insurance_trigger`
- **Constraints enforced in system prompt**: Cannot invent probabilities, damage, or flood depth. Cannot modify risk scores or rankings. Cannot claim official warning status. Cannot authorize dispatch.
- **Fallback**: Deterministic explanation via `buildDeterministicExplanation()` — works with no API key.

---

## 7. Temporal Firewall

```
PREDICTION phase (T-24h):
  ALLOWED:  WorldPop, NASADEM, OSM infrastructure, scenario rainfall, GDACS live track
  BLOCKED:  GPM event observation, Sentinel-1 actual, Copernicus EMSR357, post-event damage

REVEAL (explicit operator action):
  UNLOCKED: GPM rainfall observation, Sentinel-1 inundation proxy

EVALUATE:
  METRICS:  precisionAtK, observedZoneRecall, populationWeightedCapture, infrastructureWeightedCapture
```

Enforced by `TemporalFirewall.assertAllowed()` in `gee-loader.ts` — throws `TemporalFirewallError` on violation.

---

## 8. Cyclone Track

- GDACS live adapter: 5-second timeout, Bay of Bengal filter
- Returns current position only (no invented forecast track)
- Falls back to Fani 2019 demo fixture when no live event
- Open-Meteo ECMWF provides supplementary meteorological context at Puri (19.8°N, 85.83°E)
- Open-Meteo is labelled MODEL-DERIVED, NOT an official IMD forecast

---

## 9. Impact Model

```
H = 0.40 × Hwind + 0.30 × Hrainfall + 0.30 × Hsurge

E = 0.35 × Epopulation + 0.25 × Ebuildings + 0.15 × Eroads + 0.25 × Ecritical

impactExposure = H × E × susceptibility

AssetRisk = HazardExposure × AssetVulnerability × Criticality × DependencyCentrality

InterventionBenefit = 0.50 × impactExposure + 0.30 × Criticality + 0.20 × DependencyCentrality

susceptibility = f(NASADEM elevation, coastal proximity)
```

Weights are policy/model parameters, not universal physical constants.
`InterventionBenefit` is a **weighted sum**, not a product. It is not a physical risk probability.

---

## 10. Infrastructure + Dependency Model

- 15 curated critical infrastructure assets (hospitals, shelters, bridges, power, water, emergency services)
- Locations: approximate public/OSM references — inventory incomplete
- Criticality weights: hospital=1.0, emergency_service=0.95, shelter=0.90, bridge=0.85, power=0.85, water=0.85
- Dependency centrality: spatial H3 proxy (not full network routing)
- Building/road exposure: synthetic DEMO_FIXTURE counts (Open Buildings not integrated)

---

## 11. Priority Optimizer

- Greedy deterministic top-K selection
- Spatial overlap guard: adjacent H3 cells (H3 neighbors) cannot both be selected
- Objective modes: balanced, population, infrastructure, service_continuity
- K changes the intervention set, not the underlying risk scores
- Verified: K=5 ⊆ K=20; risk scores identical across K values

---

## 12. Advisory Workflow

```
PENDING → (operator approves) → APPROVED → (dispatch) → SIMULATED_SENT
                             ↘ (operator rejects) → REJECTED
```

- POST `/api/advisory` → generates PENDING advisory
- POST `/api/advisory/[id]/approve` → APPROVED or REJECTED
- POST `/api/advisory/[id]/dispatch` → 422 if not APPROVED; SIMULATED_SENT if APPROVED
- Dispatch sends to `DISPATCH_WEBHOOK_URL` (default: local `/api/webhook/receive`)
- Body includes: `"note": "SIMULATED DISPATCH — decision-support prototype only"`

---

## 13. Insurance Demonstration

- Trigger: parametric (wind speed ≥ 44.7 m/s OR rainfall ≥ 200 mm OR surge ≥ 1.5 m)
- Illustrative payout: ₹10,000,000 (indicative only)
- All output labelled: `ILLUSTRATIVE POLICY` / `INDICATIVE PARAMETRIC LIQUIDITY ESTIMATE`
- No real insurer underwriting, no binding coverage, no actual payout

---

## 14. Fani 2019 Replay

- Anchored to Cyclone Fani (ESCS), landfall 03 May 2019 near Puri, Odisha
- T-24h prediction cutoff: `2019-05-02T05:00:00Z`
- Prediction uses only pre-event data (WorldPop, NASADEM, scenario rainfall, track)
- Reveal unlocks: GPM 96h rainfall observation (Apr 30–May 4) + Sentinel-1 post-event
- 7-phase state machine: PREDICTION → EXPLAIN → SCENARIO → ADVISORY → APPROVAL → REVEAL → EVALUATE

---

## 15. Evaluation Methodology

After REVEAL, the engine compares K predicted priority cells against Sentinel-1 flood proxy:

| Metric | Definition |
|--------|-----------|
| `precisionAtK` | Selected cells ∩ observed flood zone / K |
| `observedZoneRecall` | Selected cells ∩ observed zone / total observed zone cells |
| `populationWeightedCapture` | Population captured in overlap / total population in observed zone |
| `infrastructureWeightedCapture` | Criticality captured in overlap / total criticality in observed zone |

Sentinel-1 is an **observed inundation proxy** (VH backscatter change detection, σ=1.5).
Metrics reflect **model-vs-proxy agreement**, not accuracy against exact flood depth.
Evaluation target: 2,749 Sentinel-1 flooded cells in the Odisha AOI.

---

## 16. Limitations

- Not an official warning system (not replacing IMD/INCOIS)
- Surge is a flood-fill screening approximation, not a hydrodynamic model
- Infrastructure inventory: 15 curated assets — incomplete
- Buildings/roads exposure: synthetic (Open Buildings not integrated)
- GPM 96h window crosses the T-24h cutoff — is post-event observation, not forecast
- Sentinel-1 is inundation proxy, not flood-depth ground truth
- GEE spatial coverage: ~30% of AOI land cells; remainder uses synthetic fallback
- Advisory dispatch is simulated — no real emergency channel
- Insurance output is illustrative — no real contract

---

## 17. Responsible-Use Statement

This product is a **decision-support prototype**. It is not an operational emergency system.

- All recommendations require human review and approval
- No autonomous dispatch occurs
- Gemini cannot alter numerical risk scores or override rankings
- Actual response decisions must be made by qualified emergency management authorities
- Always defer to official IMD, INCOIS, and NDMA guidance

---

## 18. Demo Instructions

```bash
# Install (copies MapLibre worker files automatically)
pnpm install

# Configure (GEMINI_API_KEY optional; app works without it)
cp .env.example .env.local
# Set GEMINI_MODEL=gemini-3.8-flash for function calling

# Run development server
pnpm dev
# Open http://localhost:3000

# Production
pnpm build
node .next/standalone/server.js

# Tests
pnpm test        # 245 Vitest tests
pnpm test:e2e    # 14 Playwright tests (requires server running)
```

Navigate to **REPLAY** for the main Fani 2019 demo sequence.
Navigate to **LIVE** for the GDACS live adapter + Open-Meteo meteorological context.
Navigate to **IMPACT** for the 7-layer analytical map.
Navigate to **ACTION** for priority cards, advisory workflow, and insurance panel.

See [DEMO_SCRIPT.md](DEMO_SCRIPT.md) for the strict 3-minute demo sequence.

---

## 19. India-First Architecture — BRICS Portability

The engine is region-configurable via `src/lib/region-config.ts`. A `RegionConfig` object
packages all geography-specific settings:

- AOI bounding box and H3 spatial resolution
- Default map centre and zoom
- Demo cyclone name and prediction cutoff
- Hazard / exposure policy weight overrides
- Data source provenance per layer
- Known limitations for the region

`ACTIVE_REGION = ODISHA_REGION` — the Fani 2019 Odisha coastal corridor is the single
polished demo. Extending to another Indian coastal context (Andhra Pradesh, Tamil Nadu,
Gujarat) or to another BRICS context (Mozambique Channel, Bangladesh coastline) requires:

1. Running the GEE preprocessing scripts (`pipelines/gee/`) against the new AOI.
2. Providing an OSM-derived infrastructure JSON for the region.
3. Creating a new `RegionConfig` constant with the region's data provenance.
4. Regenerating the H3 fixture with regional cyclone track parameters.

The decision question, analytical pipeline, advisory workflow, and temporal firewall
are identical across regions. Only data inputs and policy defaults change.

---

## 20. Health Diagnostic

`GET /api/health` returns gemini status without exposing the API key:

```json
{
  "ok": true,
  "status": "healthy",
  "engineVersion": "0.1.0",
  "dataVersion": "0.1.0-demo-fixture",
  "geminiStatus": "CONFIGURED",
  "geminiModel": "gemini-3.8-flash",
  "timestamp": "..."
}
```

`geminiStatus` values:
- `CONFIGURED` — `GEMINI_API_KEY` is set; live function-calling is attempted per query; deterministic fallback activates on timeout or error.
- `UNCONFIGURED` — no API key; deterministic fallback is always used; app remains fully functional.
