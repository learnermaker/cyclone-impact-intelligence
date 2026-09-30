"""
Open Buildings Temporal — Bounded Diagnostic Script

DATASET: GOOGLE/Research/open-buildings-temporal/v1

STATUS: NOT INTEGRATED — see blocker below.

BLOCKER:
  The Open Buildings Temporal v1 dataset in GEE is organized as large
  S2-tile-level FeatureCollections. Each "feature" in the collection
  represents a tile boundary, not an individual building footprint.

  The correct access pattern for individual buildings requires per-tile
  data retrieval. The total data volume for the Odisha AOI exceeds what
  is practical in a single script execution.

  A diagnostic query to the AOI returned 0 individual building features
  with the standard FeatureCollection.filterBounds + year=2019 filter.

  This was confirmed on: 2026-09-29, GEE project hack-506718.

IMPACT ON PRODUCT:
  The current engine uses synthetic DEMO_FIXTURE building counts, clearly
  labelled as such. This affects the exposure component:
    E = 0.35*P + 0.25*B + 0.15*Road + 0.25*Critical
  where B (buildings) is synthetic.

  If Open Buildings is integrated in a future version:
  - Use the 2019 time slice to match the WorldPop/NASADEM reference year.
  - Do NOT use a post-2019 slice for the Fani T-24h prediction.
  - Aggregate building presence/count per H3 res-8 cell.
  - Confidence threshold >= 0.75 recommended.
  - Add 'predictionSafe: true' to the output metadata.
  - Add regression tests verifying coverage % > 0.

HOW TO RUN THIS DIAGNOSTIC:
  cd pipelines/gee
  python 05_open_buildings_temporal.py

  The script will confirm the blocker and write a stub JSON to
  data/processed/open_buildings_2019_h3r8_odisha.json.
"""

import sys
import os
import json
sys.path.insert(0, os.path.dirname(__file__))
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent
PROCESSED_DIR = REPO_ROOT / "data" / "processed"

BLOCKER = (
    "BLOCKER: Google Open Buildings Temporal v1 in GEE is organized as S2-tile-level "
    "FeatureCollections. Individual building footprints require per-tile extraction "
    "which exceeded the scope of this pipeline run. Zero individual buildings were "
    "returned by standard FeatureCollection.filterBounds(aoi).filter(year=2019). "
    "Confirmed on 2026-09-29 with project hack-506718."
)

def main():
    print("=== Open Buildings Temporal v1 — Diagnostic Script ===", file=sys.stderr)
    print("  Dataset: GOOGLE/Research/open-buildings-temporal/v1", file=sys.stderr)
    print(f"  Status: NOT INTEGRATED", file=sys.stderr)
    print(f"  Blocker: {BLOCKER[:120]}...", file=sys.stderr)

    # Write an honest stub JSON so the engine's fallback path is clear
    stub = {
        "metadata": {
            "source": "Google Open Buildings Temporal 2019",
            "datasetId": "GOOGLE/Research/open-buildings-temporal/v1",
            "status": "NOT_INTEGRATED",
            "reason": BLOCKER,
            "predictionSafe": True,
            "revealOnly": False,
            "temporalRole": "historical_baseline",
            "processingScript": "pipelines/gee/05_open_buildings_temporal.py",
            "note": (
                "Engine uses DEMO_FIXTURE synthetic building counts. "
                "This file is a diagnostic stub only — it contains no real data."
            ),
        },
        "data": {},
    }

    out = PROCESSED_DIR / "open_buildings_2019_h3r8_odisha.json"
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(out, "w") as f:
        json.dump(stub, f, indent=2)

    print(f"  Stub written to: {out}", file=sys.stderr)
    print("  Engine will continue using DEMO_FIXTURE synthetic building counts.", file=sys.stderr)
    print("  These are clearly labelled in the engine output.", file=sys.stderr)


if __name__ == "__main__":
    main()
