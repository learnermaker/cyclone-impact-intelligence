# Three-Minute Demo Script

**Product**: Cyclone Impact Intelligence & Action Engine
**Scenario**: Cyclone Fani 2019 — T-24h pre-event reconstruction
**Operator**: Municipal disaster-management authority, Odisha coastal corridor

> This demo does NOT depend on a live cyclone being active.
> The Fani 2019 replay provides a complete, self-contained demonstration.

---

## 0:00–0:15 — Problem statement

**Say:**
> "Cyclone forecasts tell us where the storm is. The harder question is which
> communities and infrastructure to act on first when we have limited capacity to respond."

**Navigate to**: `/app/live`

**Show:**
- No active cyclone → honest empty state ("No active cyclone event")
- Open-Meteo meteorological context visible (model-derived, clearly labelled)
- Fani 2019 Replay button available

---

## 0:15–0:35 — Fani T-24h prediction state

**Click**: "Fani 2019 Replay"

**Navigate to**: `/app/replay`

**Show:**
- Cyclone Fani 2019 header
- **T-24H PREDICTION** label on map
- Information firewall notice: "only pre-event data shown"
- GEE ENRICHED · MIXED COVERAGE badge (with ~30% coverage note)
- Left panel stats: Land cells, High hazard count, Surge exposed count

**Say:**
> "We're at T-minus-24 hours. The information firewall prevents any
> post-event data from influencing the prediction."

---

## 0:35–0:55 — Hazard and impact map layers

**Navigate to**: `/app/impact`

**Toggle layers** in this order:
1. **Combined Hazard** — YlOrRd coastal concentration
2. **Rainfall** — blue gradient across corridor
3. **Surge** — green coastal strip only
4. **Population** — blue density clusters
5. **Impact Exposure** — composite score

**Click** a coastal cell near Puri.

**Show:**
- Cell detail panel: hazard breakdown, exposure, susceptibility, infrastructure
- Confidence bar and source tier

**Say:**
> "Hazard becomes impact only when we account for exposure and terrain susceptibility.
> WorldPop 2019 and NASADEM provide the real spatial data."

---

## 0:55–1:20 — Infrastructure and priorities

**Navigate to**: `/app/action`

**Show:**
- Priority card list (top-K selected cells)
- Infrastructure asset circles on map (hospital=red, shelter=blue, bridge=yellow)
- "Mapped assets — curated inventory, incomplete" caveat
- Capacity K slider

**Change K** from default to 5:
- Priority list updates
- Map shows only 5 selected cells

**Change K** back to 10:
- Risk scores DO NOT CHANGE (only the selection set expands)

**Say:**
> "The risk surface is fixed. Changing capacity changes the feasible intervention set,
> not the underlying risk."

---

## 1:20–1:40 — Gemini explanation (Why #1)

**Click**: "Why #1?" on the top priority card

**Show:**
- Structured breakdown immediately: hazard %, exposure %, criticality %, dependency %
- Evidence list: surge-exposed, high population, infrastructure criticality
- Recommended actions
- Gemini 3.7 explanation appearing below (or deterministic fallback if API unavailable)

**Say:**
> "Gemini explains the decision using deterministic tool results.
> It cannot change the numerical outputs."

---

## 1:40–1:55 — Scenario modelling

**Show** the scenario controls at bottom of ACTION page:
- Increase wind multiplier to 1.3
- Surge height slider

**Show:**
- Priority cells shift
- "SIMULATED SCENARIO" warning banner
- Risk changes are localized to the modified parameters

---

## 1:55–2:15 — Generate advisory

**Click**: "Advisory" on the top priority card

**Show:**
- Advisory panel: structured evidence-backed recommendation
- Initial status: **PENDING**
- Human approval required

**Click** "Approve" → status becomes **APPROVED**

**Click** "Dispatch" (only available after approval) → **SIMULATED_SENT**

**Say:**
> "Human approval is mandatory. The system cannot dispatch autonomously."

---

## 2:15–2:25 — Insurance demonstration

**Click** the "Insurance" tab

**Show:**
- `ILLUSTRATIVE POLICY` label
- `INDICATIVE PARAMETRIC LIQUIDITY ESTIMATE`
- Trigger conditions met/not met

**Say:**
> "This is an illustrative parametric concept — not real insurance, no real payout."

---

## 2:25–2:40 — Reveal Sentinel-1 actual

**Navigate to**: `/app/replay`

**Click** "Reveal Actual" phase button → "Reveal Actual Impact"

**Show:**
- Badge changes from DEMO FIXTURE to AUTHORITATIVE OPEN
- Map switches to Sentinel-1 blue flood proxy layer
- "OBSERVED INUNDATION PROXY — Sentinel-1 SAR" label on map

**Say:**
> "This is post-event SAR evidence — an inundation proxy, not exact flood depth."

---

## 2:40–2:50 — Evaluation metrics

**Click** "Evaluate" phase

**Show:**
- `precisionAtK`: fraction of selected cells in observed zone
- `observedZoneRecall`: zone coverage
- `populationWeightedCapture`
- `infrastructureWeightedCapture`
- Sentinel-1 proxy caveat displayed

**Say:**
> "These metrics show model-vs-proxy agreement, not historical accuracy."

---

## 2:50–3:00 — Differentiator close

**Say:**
> "GEE provides the spatial evidence.
> The deterministic engine turns evidence into constrained priorities.
> Gemini explains the decision without being allowed to change the numerical result.
> Human approval remains required at every step."

---

## Notes for demo reliability

- The demo works **offline** — no live cyclone, no Gemini key, no GEE access required.
- If Gemini returns an error, the deterministic explanation activates automatically.
- If GDACS is unreachable, the LIVE page shows the honest "no active event" state.
- The Fani replay is deterministic and reproducible across machines.
