# Assumptions, Limitations, and Responsible Use

## What this system is

A **decision-support prototype** that converts cyclone hazard forecasts into
localized impact intelligence, infrastructure-aware response priorities, and
explainable advisories.

## What this system is NOT

| Claim | Reality |
|-------|---------|
| Official warning system | Not a replacement for IMD, INCOIS, or local authorities |
| Structural failure prediction | High risk score = modelled disruption exposure, not building collapse |
| Operational hydrodynamic surge model | Bathtub screening approximation, not ADCIRC |
| Autonomous emergency dispatcher | Human approval required before any advisory dispatch |
| Real insurance platform | All insurance output is illustrative, no real contract or payout |
| Generalization across all cyclones | Fani is one anchor event — one replay ≠ performance proof |
| Complete infrastructure inventory | OSM data may be incomplete — labelled as "mapped assets in available datasets" |

## Key assumptions

1. Hazard forecasts are imperfect and carry uncertainty.
2. Exposure data is incomplete and temporally mismatched in some live cases.
3. Criticality weights are policy parameters, not engineering assessments.
4. Vulnerability functions are screening approximations.
5. Scenario surge is a screening model unless sourced from an official product.
6. Dependency centrality is a spatial/network proxy, not from full network routing.
7. Intervention effectiveness is an explicit assumption.

## UI labels in use

All UI elements display one of these labels based on data source:

| Label | Meaning |
|-------|---------|
| `OFFICIAL SOURCE` | From IMD or INCOIS official products |
| `MODEL-DERIVED` | Engine-computed from authoritative inputs |
| `SIMULATED SCENARIO — NOT AN OFFICIAL FORECAST` | User scenario override |
| `HISTORICAL OBSERVATION` | Post-event evidence (replay only) |
| `ILLUSTRATIVE POLICY` | Insurance panel outputs |
| `DEMO FIXTURE` | Synthetic development data |

## Responsible use

This system is designed to **inform and support human decision-making**, not to
replace it. All recommendations require human review. Advisory dispatch is
gated behind explicit human approval.

Do not use this system as the sole basis for emergency response decisions.
Always consult official sources: https://mausam.imd.gov.in
