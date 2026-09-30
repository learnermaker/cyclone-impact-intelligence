# Cyclone Impact Intelligence & Action Engine

**Code for Communities 2.0 — Cyclone / Resilience Track**

---

## 1. Problem

Cyclone forecasting tells operators *where* the storm is going.  
The harder operational question is **which communities and infrastructure to act on first when response capacity is constrained — and why**.

---

## 2. Solution

**Cyclone Impact Intelligence** converts cyclone hazard inputs and geospatial evidence into constrained, infrastructure-aware, explainable response priorities.

The engine combines:

| Component | Method |
|---|---|
| Wind hazard | Normalized Fani scenario / live event context |
| Rainfall hazard | Open-Meteo ECMWF forecast for live context; GPM Fani observation only after REVEAL |
| Surge hazard | Coastal flood-fill BFS, explicitly treated as a screening approximation |
| Exposure | WorldPop 2019 population + synthetic building/road fixture values |
| Terrain susceptibility | NASADEM elevation → flood susceptibility function |
| Impact | `hazard × exposure × susceptibility` |
| Infrastructure risk | `HazardExposure × Vulnerability × Criticality × DependencyCentrality` |
| Priority optimizer | Deterministic greedy top-K with H3 spatial overlap guard |
| Advisory | Structured evidence-backed advisory + mandatory human approval |
| Insurance | Illustrative parametric liquidity indicator |
| Evaluation | Prediction vs Sentinel-1 observed inundation proxy |

---

## 3. Why This Is Different

- **Earth Engine preprocessing** supplies WorldPop 2019, NASADEM, GPM IMERG and Sentinel-1-derived assets as committed compact data products. Runtime operation has no Earth Engine dependency.
- **Temporal firewall** prevents reveal-only GPM and Sentinel-1 observations from entering the T−24h prediction path.
- **Gemini as explanation, not authority**: the model calls deterministic tools for evidence and cannot modify risk scores or rankings.
- **Human approval gate** prevents autonomous advisory dispatch.
- **Honest data-status labeling** exposes mixed real/synthetic coverage rather than presenting the demo fixture as fully observed geography.

---

## 4. Architecture

```text
Browser: React 19 + MapLibre v6
        ↓
Next.js 16 server routes
        ↓
Deterministic H3 analytical engine
        ↓
Committed GEE-enriched / fixture data
        ↓
Gemini 3.8 Flash explanation layer
        ↓
Optional live adapters: GDACS + Open-Meteo
```

Deployment target: single container on Cloud Run, region `us-central1`.

---

## 5. Data Provenance

| Dataset | Role | Status |
|---|---|---|
| WorldPop 2019 | Population exposure | GEE-executed, integrated |
| NASADEM | Terrain/susceptibility | GEE-executed, integrated |
| GPM IMERG | Fani event rainfall | Reveal-only |
| Sentinel-1 GRD | Observed inundation proxy | Reveal-only |
| OpenStreetMap Jan 2019 | Curated infrastructure subset | 15 assets, incomplete |
| Open Buildings Temporal | Building enrichment | Not integrated |
| Copernicus EMSR357 | Validation | Not integrated |

**Coverage wording:** approximately 30% of fixture land cells are jointly enriched with WorldPop and NASADEM. Remaining cells use clearly-labelled synthetic fallback.

---

## 6. Gemini Integration

- Model: `gemini-3.8-flash`
- SDK: `@google/genai` v2
- 9 deterministic function-calling tools
- Maximum 4 tool-call iterations
- Deterministic engine remains authoritative for all numbers and rankings

Tool set:

`get_event_status`  
`get_cell_risk`  
`get_asset_risk`  
`get_priority_list`  
`get_dependency_graph`  
`run_scenario`  
`get_historical_replay`  
`generate_advisory`  
`evaluate_insurance_trigger`

Gemini responses must be identified accurately as:
- live tool-grounded response;
- live text-only response, when applicable;
- deterministic fallback.

No Gemini response is allowed to alter the deterministic numerical result.

---

## 7. Temporal Firewall

### PREDICTION
Allowed: WorldPop, NASADEM, OSM infrastructure, scenario rainfall, permitted live event context.

Blocked: GPM event observations, Sentinel-1 actual inundation, post-event validation.

### REVEAL
Post-event evidence becomes explicitly available after operator action.

### EVALUATE
Evaluation metrics are computed only after reveal.

The firewall is enforced in application code through `TemporalFirewall.assertAllowed()`.

---

## 8. Impact Model

```text
H = 0.40 × wind + 0.30 × rainfall + 0.30 × surge

E = 0.35 × population
  + 0.25 × buildings
  + 0.15 × roads
  + 0.25 × critical infrastructure

impactExposure = hazard × exposure × susceptibility

AssetRisk =
  HazardExposure × Vulnerability × Criticality × DependencyCentrality

InterventionBenefit =
  0.50 × impactExposure
  + 0.30 × Criticality
  + 0.20 × DependencyCentrality
```

These are policy/model parameters. They are not universal scientific constants and the intervention score is not a physical failure probability.

---

## 9. Infrastructure and Dependencies

- 15 curated OSM/public-reference infrastructure assets.
- Asset inventory is explicitly incomplete.
- Dependency centrality is a spatial/H3 proxy, not a full road-routing or electrical-grid simulation.
- Building/road exposure remains synthetic fixture data.

---

## 10. Priority Optimization

- Deterministic greedy top-K.
- H3 spatial-overlap guard.
- Objectives: `balanced`, `population`, `infrastructure`, `service_continuity`.
- K changes the feasible intervention set; underlying risk values remain unchanged.

---

## 11. Advisory Workflow

```text
PENDING
  ↓ operator approval
APPROVED
  ↓ dispatch
SIMULATED_SENT

PENDING → REJECTED
```

No autonomous dispatch occurs.

---

## 12. Insurance Demonstration

The insurance panel is an **illustrative policy** only. It does not represent a real contract, underwriting decision, or payout.

---

## 13. Fani 2019 Replay

- Fani landfall context: near Puri, Odisha.
- T−24h cutoff: `2019-05-02T05:00:00Z`.
- Seven phases: PREDICTION → EXPLAIN → SCENARIO → ADVISORY → APPROVAL → REVEAL → EVALUATE.
- Prediction and post-event evidence are explicitly separated.

---

## 14. Evaluation

After REVEAL, selected priority cells are compared with the Sentinel-1 observed inundation proxy.

Metrics:

- `precisionAtK`
- `observedZoneRecall`
- `populationWeightedCapture`
- `infrastructureWeightedCapture`

These metrics indicate **model-vs-proxy agreement**. They are not exact flood-depth accuracy claims.

---

## 15. Limitations

- Not an official warning system.
- Surge is a screening approximation, not a hydrodynamic forecast.
- Land/water classification currently uses `DEMO_HEURISTIC_PIECEWISE_V2`; it is not a validated satellite-derived coastline.
- Infrastructure inventory is incomplete.
- Building and road exposure use synthetic fixture values.
- GEE enrichment covers only part of the fixture.
- Sentinel-1 is an inundation proxy, not exact flood depth.
- Advisory dispatch is simulated.
- Insurance output is illustrative.

---

## 16. Responsible Use

This is a **decision-support prototype**, not an operational emergency-management system.

Operators must defer to appropriate official emergency, meteorological and disaster-management authorities.

---

## 17. India-First / BRICS-Portability Architecture

`src/lib/region-config.ts` defines a `RegionConfig` contract for:

- AOI and spatial resolution
- map defaults
- cyclone/replay metadata
- policy parameters
- provenance
- limitations

`ACTIVE_REGION = ODISHA_REGION`.

The Odisha/Fani corridor is the fully demonstrated profile. Porting to another Indian coastal context or BRICS context requires new regional data products and fixture generation; the analytical decision pipeline remains reusable.

---

## 18. Health and Runtime Diagnostics

`GET /api/health` exposes server readiness plus Gemini configuration status without exposing the API key.

`geminiStatus` means:

- `CONFIGURED`: a key is configured and live Gemini calls can be attempted.
- `UNCONFIGURED`: no key is configured and deterministic fallback is available.

Configuration status does **not** by itself prove a successful live function-calling exchange.

---

## 19. Local Verification

```text
pnpm type-check
pnpm test        # 245 Vitest tests
pnpm test:e2e    # 14 Playwright tests
pnpm build
```

---

## 20. Deployment

The prototype is deployed on Google Cloud Run:

**Live demo:**  
https://cyclone-impact-intelligence-273553356850.us-central1.run.app

Deployment architecture:
- Single Next.js application
- Single container
- Google Cloud Run
- Region: `us-central1`
- Server-side Gemini API configuration
- No runtime Earth Engine dependency
- No database dependency for the primary demo

The deployed prototype is the primary judge-facing demonstration. The Fani 2019 REPLAY path provides a deterministic demonstration even when no live cyclone event is active.

---

## 21. Submission Checklist

- Source code: GitHub repository with judge access.
- Working deployed prototype:  
  https://cyclone-impact-intelligence-273553356850.us-central1.run.app
- Google AI integration: Gemini 3.8 Flash.
- Real/realistic data: WorldPop, NASADEM, OSM and Earth Engine-derived reveal assets plus explicitly labelled fixture fallback.
- India-first: Odisha coastal corridor with reusable region configuration.
- Scale path: regional data adapters / preprocessing rather than hard-coded core algorithms.
- Demo video: 3–5 minute end-to-end demonstration.
- Pitch deck: 10–12 slides.
- Project description: 2–3 lines.

---

## 22. Primary Judging Path

```text
REPLAY
→ T−24h Prediction
→ Explain / Why #N
→ Scenario
→ Advisory
→ Approve
→ Reveal Actual
→ Evaluate
```

Use `/app/action` to emphasize constrained top-K intervention selection and human-gated response.
