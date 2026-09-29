"""
WorldPop 2019 — Population Sampling at H3 Centroids

Dataset:  WorldPop/GP/100m/pop_age_sex (India 2019)
Band:     population
Scale:    100m
Reducer:  sum (total population in H3 cell area)
Output:   data/processed/worldpop_2019_h3r8_odisha.json

Source tier: GEE_DERIVED → AUTHORITATIVE_OPEN
License:  CC BY 4.0  https://hub.worldpop.org/doi/10.5258/SOTON/WP00532
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
    print("=== WorldPop 2019 Pipeline ===", file=sys.stderr)
    ee.Initialize(project="hack-506718")

    # ── Load dataset ─────────────────────────────────────────────────────────
    # WorldPop GP 100m — India 2019 total population
    # Using WorldPop/GP/100m/pop which has annual data from 2000-2020
    # (WorldPop/GP/100m/pop_age_sex only has 2020 for India)
    pop_img = (
        ee.ImageCollection("WorldPop/GP/100m/pop")
        .filter(ee.Filter.eq("country", "IND"))
        .filter(ee.Filter.eq("year", 2019))
        .select("population")
        .first()
    )

    aoi = get_aoi_geometry(ee)
    pop_clipped = pop_img.clip(aoi)
    print("  WorldPop 2019 image loaded (WorldPop/GP/100m/pop)", file=sys.stderr)

    # ── Load H3 centroids ────────────────────────────────────────────────────
    centroids = load_h3_centroids(max_coastal_km=25)
    if not centroids:
        print("  No centroids found — exiting", file=sys.stderr)
        return

    # ── Sample function ──────────────────────────────────────────────────────
    def sampler(fc):
        return pop_clipped.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.sum(),
            scale=100,
        )

    results = sample_in_batches(sampler, centroids, ee, batch_size=400, scale=100)

    # ── Extract population values ─────────────────────────────────────────────
    pop_data = {}
    for cell_id, props in results.items():
        # With a single 'population' band + sum reducer, the key is 'sum'
        val = props.get("sum")
        if val is not None and val >= 0:
            pop_data[cell_id] = round(float(val), 1)

    if not pop_data:
        print("  No population data retrieved — check GEE authentication", file=sys.stderr)
        return

    stats = sorted(pop_data.values())
    n = len(stats)
    print(f"  Population range: {stats[0]:.0f}–{stats[-1]:.0f}, median: {stats[n//2]:.0f}", file=sys.stderr)

    # ── Write output ──────────────────────────────────────────────────────────
    metadata = make_metadata(
        source_name="WorldPop 2019 India (100m)",
        dataset_id="WorldPop/GP/100m/pop_age_sex",
        reference_date="2019-01-01T00:00:00Z",
        spatial_resolution="100m → aggregated to H3 resolution 8",
        license_str="CC BY 4.0",
        source_url="https://hub.worldpop.org/doi/10.5258/SOTON/WP00532",
        processing_script="01_worldpop_h3_sample.py",
        extra={"cellCount": len(pop_data), "reducer": "sum over H3 cell area"},
    )
    write_processed("worldpop_2019_h3r8_odisha.json", pop_data, metadata)
    print("  WorldPop pipeline complete.", file=sys.stderr)

if __name__ == "__main__":
    main()
