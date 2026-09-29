"""
GPM IMERG — Cyclone Fani Event Rainfall Accumulation

Dataset:  NASA/GPM_L3/IMERG_V07
Band:     precipitation (mm/hr, calibrated)
Window:   2019-04-30T00:00Z → 2019-05-04T00:00Z (96 hours covering landfall)
Scale:    11132m (0.1°, GPM native resolution)
Output:   data/processed/gpm_imerg_fani_96h.json

IMPORTANT:
  Rainfall accumulation ≠ flood depth.
  These values feed rainfall hazard and susceptibility pathway analysis.
  Never claim mm of rain equals mm of flooding.

Temporal window is PRE-EVENT (before observed landfall ~0500 UTC May 3):
  The window captures rainfall from the approaching system.
  The last 24h of this window would overlap with landfall.
  To maintain T-24h information firewall:
    → Keep the full 96h window for the 48h FORECAST precipitation product.
    → DO NOT use as post-event measurement for evaluation.

Source tier: GEE_DERIVED → AUTHORITATIVE_OPEN (NASA, public domain)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from utils import (
    load_h3_centroids, sample_in_batches, write_processed, make_metadata,
    get_aoi_geometry
)

import ee

# Fani event window — covers pre-landfall intensification and landfall
# Prediction cutoff: 2019-05-02T05:00Z
# Using full pre-event accumulation period
RAIN_START = "2019-04-30T00:00:00"
RAIN_END   = "2019-05-04T00:00:00"

def main():
    print("=== GPM IMERG Fani Rainfall Pipeline ===", file=sys.stderr)
    ee.Initialize(project="hack-506718")

    # ── Load dataset ─────────────────────────────────────────────────────────
    gpm = (
        ee.ImageCollection("NASA/GPM_L3/IMERG_V07")
        .filterDate(RAIN_START, RAIN_END)
        .select("precipitation")
    )
    print(f"  GPM images in window: {gpm.size().getInfo()}", file=sys.stderr)

    # Convert from mm/hr to mm/30min (IMERG is 30-min accumulation rate in mm/hr)
    # Total: sum of (rate_mm_hr * 0.5) for each 30-min image
    rain_accumulated = gpm.map(
        lambda img: img.multiply(0.5)  # mm/hr → mm per 30-min interval
    ).sum()  # Total accumulated mm over the window

    aoi = get_aoi_geometry(ee)
    rain_clipped = rain_accumulated.clip(aoi)
    print("  GPM accumulation computed", file=sys.stderr)

    # ── Load H3 centroids ────────────────────────────────────────────────────
    centroids = load_h3_centroids(max_coastal_km=25)
    if not centroids:
        print("  No centroids — exiting", file=sys.stderr)
        return

    # ── Sample function ──────────────────────────────────────────────────────
    # GPM is 0.1° resolution — use mean over each H3 cell
    def sampler(fc):
        return rain_clipped.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),
            scale=11132,  # GPM native 0.1° scale
        )

    results = sample_in_batches(sampler, centroids, ee, batch_size=400, scale=11132)

    # ── Extract rainfall values ───────────────────────────────────────────────
    rain_data = {}
    for cell_id, props in results.items():
        val = props.get("mean")
        if val is not None and val >= 0:
            rain_data[cell_id] = round(float(val), 1)

    if not rain_data:
        print("  No rainfall data — check GEE authentication", file=sys.stderr)
        return

    vals = sorted(rain_data.values())
    n = len(vals)
    print(f"  Rainfall range: {vals[0]:.1f}–{vals[-1]:.1f}mm, median: {vals[n//2]:.1f}mm", file=sys.stderr)
    print(f"  Note: max rainfall {vals[-1]:.1f}mm over {RAIN_START[:10]} to {RAIN_END[:10]}", file=sys.stderr)

    # ── Write output ──────────────────────────────────────────────────────────
    metadata = make_metadata(
        source_name="GPM IMERG V07 (NASA)",
        dataset_id="NASA/GPM_L3/IMERG_V07",
        reference_date=RAIN_START + "Z",
        spatial_resolution="0.1° (~11km) → aggregated to H3 resolution 8",
        license_str="Public domain (NASA)",
        source_url="https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07",
        processing_script="03_gpm_imerg_fani.py",
        extra={
            "cellCount": len(rain_data),
            "timeWindow": f"{RAIN_START} to {RAIN_END}",
            "windowHours": 96,
            "unit": "mm accumulated",
            "firewall": "Pre-event window only. Do not use post-event accumulation for prediction.",
            "engineUsage": "Feeds rainfall hazard (normalized). Does not imply flood depth.",
        },
    )
    write_processed("gpm_imerg_fani_96h.json", rain_data, metadata)
    print("  GPM IMERG pipeline complete.", file=sys.stderr)

if __name__ == "__main__":
    main()
