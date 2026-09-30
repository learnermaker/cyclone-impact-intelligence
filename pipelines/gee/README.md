# pipelines/gee/ — Earth Engine Preprocessing

Google Earth Engine (GEE) preprocessing pipeline. **Runs once** to export
compact derived assets. GEE is NOT a runtime Next.js dependency — it is a
preprocessing layer only.

> **Status (September 2026):** All four primary scripts have been executed
> against project `hack-506718` and their outputs are committed under
> `data/processed/` and `data/historical/fani/actual/`.

---

## Prerequisites

- GEE account: <https://earthengine.google.com>
- Authenticate: `earthengine authenticate` (or `ee.Authenticate()`)
- Project: set `EARTHENGINE_PROJECT=hack-506718` in `.env`
- Python dependencies: `earthengine-api h3 pyproj`

---

## Scripts

| # | File | Dataset | Output | Status |
|---|------|---------|--------|--------|
| 01 | `01_worldpop_h3_sample.py` | `WorldPop/GP/100m/pop` (2019) | `data/processed/worldpop_2019_h3r8_odisha.json` | ✅ Executed |
| 02 | `02_nasadem_h3_sample.py` | `NASA/NASADEM_HGT/001` | `data/processed/nasadem_h3r8_odisha.json` | ✅ Executed |
| 03 | `03_gpm_imerg_fani.py` | `NASA/GPM_L3/IMERG_V07` | `data/processed/gpm_imerg_fani_96h.json` | ✅ Executed |
| 04 | `04_sentinel1_flood_actual.py` | `COPERNICUS/S1_GRD` | `data/historical/fani/actual/sentinel1_flood_extent.json` | ✅ Executed |

### Not yet integrated

| Dataset | GEE ID | Reason |
|---------|--------|--------|
| Open Buildings Temporal | `GOOGLE/Research/open-buildings-temporal/v1` | Bounded attempt — see below |
| CHIRPS rainfall baseline | `UCSB-CHC/CHIRPS/V3/PENTAD` | Deferred — see below |

---

## Output format

All processed products use the format:
```json
{
  "metadata": {
    "source": "...",
    "datasetId": "...",
    "referenceDate": "...",
    "processingDate": "...",
    "spatialResolution": "...",
    "aoi": "Puri/Khurda/Ganjam coastal corridor, Odisha, India",
    "h3Resolution": 8,
    "maxCoastalProximityKm": 25,
    "license": "...",
    "sourceUrl": "...",
    "processingScript": "...",
    "project": "hack-506718",
    "cellCount": 7719
  },
  "data": {
    "<h3-cell-id>": <value>,
    ...
  }
}
```

The Sentinel-1 output uses nested objects per cell:
```json
"data": {
  "<h3-cell-id>": { "floodedFraction": 0.0, "changeDb": -12.55, "isFlooded": true },
  ...
}
```

---

## Verified data provenance

| Product | Dataset ID | Reference date | Cells | Non-zero | Value range |
|---------|-----------|----------------|-------|----------|-------------|
| WorldPop 2019 | `WorldPop/GP/100m/pop` | 2019-01-01 | 7,719 | 4,818 | 0–293.6 persons |
| NASADEM | `NASA/NASADEM_HGT/001` | 2000-02-11 | 7,715 | 5,233 | 0–119 m |
| GPM IMERG Fani | `NASA/GPM_L3/IMERG_V07` | 2019-04-30 | 7,718 | 7,718 | 67–189 mm |
| Sentinel-1 SAR | `COPERNICUS/S1_GRD` | 2019-05-04 | 7,715 | 2,749 flooded | VH dB change |

---

## Temporal firewall

| Product | Prediction-safe | Reveal-only | Notes |
|---------|:-:|:-:|-------|
| WorldPop 2019 | ✅ | ❌ | Historical population baseline |
| NASADEM | ✅ | ❌ | Static terrain |
| GPM IMERG Fani | ❌ | ✅ | Post-event observation — Apr 30–May 4 window crosses T−24h cutoff |
| Sentinel-1 SAR | ❌ | ✅ | Post-event inundation proxy — never enters prediction path |

---

## AOI

`[83.5, 17.5, 87.5, 22.0]` (minLng, minLat, maxLng, maxLat)

Maximum coastal proximity: 25 km. H3 resolution: 8 (~0.74 km²/cell).

---

## Running a script

```bash
# Activate your Python environment
cd pipelines/gee
python 01_worldpop_h3_sample.py
```

Output files are written to `../../data/processed/` (WorldPop, NASADEM, GPM)
or `../../data/historical/fani/actual/` (Sentinel-1 actual).

---

## Open Buildings Temporal — attempt log

Dataset: `GOOGLE/Research/open-buildings-temporal/v1`

Bounded attempt performed during submission-hardening pass:
- The dataset requires GEE access with sufficient project quota.
- Integration would improve building-count exposure.
- **Result: Not integrated.** The existing engine uses synthetic building
  counts clearly labelled `DEMO_FIXTURE`. All exposure values that depend on
  buildings are labelled with lower confidence tiers.
- Engine fallback: synthetic building counts from fixture remain in use.

---

## CHIRPS Rainfall Baseline — deferred

Dataset: `UCSB-CHC/CHIRPS/V3/PENTAD`

A long-term rainfall baseline would provide anomaly context for the Fani event.
**Deferred** — does not materially improve the constrained-response product for
the current submission and the risk of integration errors outweighs the benefit.
Document under LIMITATIONS.
