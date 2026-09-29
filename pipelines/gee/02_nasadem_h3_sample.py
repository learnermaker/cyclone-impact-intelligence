"""
NASADEM — Elevation Sampling at H3 Centroids

Dataset:  NASA/NASADEM_HGT/001 (single Image)
Band:     elevation (metres, signed int16)
Scale:    30m
Reducer:  mean (representative elevation per H3 cell)
Output:   data/processed/nasadem_h3r8_odisha.json

IMPORTANT:
  Elevation is used ONLY as input to flood susceptibility.
  It is NOT interpreted as generic vulnerability.
  Susceptibility = f(elevation, coastal_proximity)

Source tier: GEE_DERIVED → AUTHORITATIVE_OPEN (Public domain, NASA)
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from utils import (
    load_h3_centroids, sample_in_batches, write_processed, make_metadata,
    get_aoi_geometry
)

import ee

def main():
    print("=== NASADEM Elevation Pipeline ===", file=sys.stderr)
    ee.Initialize(project="hack-506718")

    # ── Load dataset ─────────────────────────────────────────────────────────
    nasadem = ee.Image("NASA/NASADEM_HGT/001").select("elevation")
    aoi = get_aoi_geometry(ee)
    nasadem_clipped = nasadem.clip(aoi)
    print("  NASADEM image loaded", file=sys.stderr)

    # ── Load H3 centroids ────────────────────────────────────────────────────
    centroids = load_h3_centroids(max_coastal_km=25)
    if not centroids:
        print("  No centroids — exiting", file=sys.stderr)
        return

    # ── Sample function ──────────────────────────────────────────────────────
    def sampler(fc):
        return nasadem_clipped.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),
            scale=30,
        )

    results = sample_in_batches(sampler, centroids, ee, batch_size=400, scale=30)

    # ── Extract elevation values ──────────────────────────────────────────────
    elev_data = {}
    for cell_id, props in results.items():
        val = props.get("mean")
        if val is not None:
            # Clamp: treat negative elevations as 0 (sea level) for land cells
            elev_data[cell_id] = round(max(0.0, float(val)), 2)

    if not elev_data:
        print("  No elevation data — check GEE authentication", file=sys.stderr)
        return

    vals = sorted(elev_data.values())
    n = len(vals)
    print(f"  Elevation range: {vals[0]:.1f}–{vals[-1]:.1f}m, median: {vals[n//2]:.1f}m", file=sys.stderr)

    # ── Write output ──────────────────────────────────────────────────────────
    metadata = make_metadata(
        source_name="NASADEM (NASA, 30m)",
        dataset_id="NASA/NASADEM_HGT/001",
        reference_date="2000-02-11T00:00:00Z",
        spatial_resolution="30m → aggregated to H3 resolution 8",
        license_str="Public domain (NASA)",
        source_url="https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001",
        processing_script="02_nasadem_h3_sample.py",
        extra={
            "cellCount": len(elev_data),
            "reducer": "mean over H3 cell area",
            "engineUsage": "Feeds flood susceptibility only — NOT generic vulnerability",
        },
    )
    write_processed("nasadem_h3r8_odisha.json", elev_data, metadata)
    print("  NASADEM pipeline complete.", file=sys.stderr)

if __name__ == "__main__":
    main()
