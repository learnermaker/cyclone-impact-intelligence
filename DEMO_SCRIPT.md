# Three-Minute Demo Script

**Live demo:**  
https://cyclone-impact-intelligence-273553356850.us-central1.run.app

**Product**: Cyclone Impact Intelligence & Action Engine  
**Scenario**: Cyclone Fani 2019 — T−24h pre-event reconstruction  
**Operator**: Municipal disaster-management authority, Odisha coastal corridor

> This is the deployed Cloud Run prototype. The primary judging path is the Fani 2019 Replay,
> which gives a deterministic end-to-end demonstration without depending on a currently active cyclone.

## 0:00–0:15 — Problem

**Say:**

> "Cyclone forecasts tell us where the storm is. The harder operational question is which communities and infrastructure to act on first when response capacity is constrained — and why."

**Navigate to** `/app/live`

**Show:** honest no-active-event state when no GDACS event is available; model-derived Open-Meteo context, clearly labelled; Fani replay entry point.

## 0:15–0:35 — T−24h prediction

**Navigate to** `/app/replay`

**Show:** `Cyclone Fani 2019 · T−24h Replay`; `T−24H PREDICTION`; information-firewall notice; `GEE ENRICHED · MIXED`; compact land/high-hazard/surge summary.

**Say:**

> "We're at T-minus-24 hours. Post-event observations are isolated by a code-enforced information firewall, so they cannot enter the prediction path."

## 0:35–0:55 — Hazard → impact

**Navigate to** `/app/impact`

Show Combined Hazard, Wind, Rainfall, Surge, Population, Impact Exposure, and Priority layers. Click a coastal cell and show hazard breakdown, exposure, susceptibility, infrastructure context, provenance, and confidence.

**Say:**

> "Hazard becomes impact only after exposure and terrain susceptibility are included. WorldPop and NASADEM supply real spatial enrichment for the covered cells; remaining fixture cells are explicitly marked as fallback data."

## 0:55–1:20 — Constrained response priority

**Navigate to** `/app/action`

Show ranked priority cards, infrastructure overlays, `K=10`, and `Balanced`.

Change K to 5, then back to 10.

**Say:**

> "K represents response capacity. Changing K changes which interventions are feasible; it does not change the underlying risk surface."

## 1:20–1:40 — Gemini grounded explanation

Click `Why #1?`.

Show the deterministic evidence, Gemini answer, and Gemini mode/status when available.

**Say:**

> "Gemini is the explanation layer, not the numerical authority. The deterministic engine supplies the facts; Gemini explains them."

> "When live tool grounding is unavailable, the system identifies the fallback mode rather than pretending the result came from a tool call."

## 1:40–1:55 — Scenario analysis

Adjust wind multiplier and surge height. Show `SIMULATED SCENARIO`, changed priorities, and preserved baseline.

**Say:**

> "This is a what-if calculation. It changes scenario assumptions, not the historical baseline."

## 1:55–2:15 — Advisory + approval gate

Click `Advisory`. Show `PENDING`. Click `Approve` → `APPROVED`. Click `Dispatch` → `SIMULATED_SENT`.

**Say:**

> "Dispatch is human-gated. The system cannot send an advisory autonomously."

## 2:15–2:25 — Illustrative liquidity

Open `Insurance`.

Show `ILLUSTRATIVE POLICY`, `INDICATIVE PARAMETRIC LIQUIDITY ESTIMATE`, and trigger state.

**Say:**

> "This is a synthetic demonstration only — not an insurance contract and not a real payout."

## 2:25–2:40 — Reveal actual evidence

Return to `/app/replay`, advance to `Reveal`, and click `Reveal Actual Impact`.

Show the actual post-event layer and Sentinel-1 inundation proxy label.

**Say:**

> "Only now is post-event evidence available. Sentinel-1 is used as an observed inundation proxy, not as exact flood-depth ground truth."

## 2:40–2:50 — Evaluation

Advance to `Evaluate`.

Show Precision@K, observed-zone recall, population-weighted capture, infrastructure-weighted capture, and the proxy caveat.

**Say:**

> "These are model-vs-proxy agreement metrics, not a claim of operational historical accuracy."

## 2:50–3:00 — Close

**Say:**

> "Earth Engine supplies spatial evidence. A deterministic engine converts hazard, exposure, susceptibility, criticality and dependency into constrained priorities. Gemini explains those decisions using grounded tools, and human approval remains mandatory before dispatch."

## Reliability notes

- The primary replay works without a live cyclone.
- The application remains functional without a Gemini key through deterministic fallback.
- A live Gemini result must be identified truthfully as tool-grounded, text-only, or deterministic fallback.
- GPM and Sentinel-1 post-event data must never appear before REVEAL.
- The land/water mask is currently a conservative demo heuristic; do not describe it as a validated satellite-derived coastline.
