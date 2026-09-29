"""
Sentinel-1 SAR — Post-Event Flood Detection (ACTUAL DATA)

Dataset:  COPERNICUS/S1_GRD
Pre-event:  2019-04-25 → 2019-04-30 (before Fani)
Post-event: 2019-05-04 → 2019-05-10 (after Fani landfall)
Method:   VH backscatter change detection
          Flooded = post_VH < (pre_VH_mean - N*std)
Output:   data/historical/fani/actual/sentinel1_flood_extent.json

CRITICAL INFORMATION FIREWALL:
  This data MUST be stored in data/historical/fani/actual/
  It must NEVER be accessible before the REVEAL ACTUAL step.
  It is NOT used in the T-24h prediction pipeline.
  It is used ONLY for:
    - Post-reveal observed impact visualization
    - Replay evaluation metrics

Source tier: GEE_DERIVED → AUTHORITATIVE_OPEN (Copernicus/ESA)
License:  Copernicus Sentinel data — see ESA terms
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from utils import (
    load_h3_centroids, sample_in_batches, write_actual, make_metadata,
    get_aoi_geometry, ACTUAL_DIR
)

import ee

# INFORMATION FIREWALL: pre-event baseline (before Fani)
PRE_START  = "2019-04-25"
PRE_END    = "2019-04-30"

# INFORMATION FIREWALL: post-event observations (after Fani)
POST_START = "2019-05-04"
POST_END   = "2019-05-10"

# Flood detection threshold (standard deviation multiplier)
# Lower = more sensitive (more cells flagged as flooded)
FLOOD_THRESHOLD_SIGMA = 1.5

def main():
    print("=== Sentinel-1 Flood Detection Pipeline (ACTUAL DATA) ===", file=sys.stderr)
    print("  INFORMATION FIREWALL: Output goes to actual/ — NOT prediction path", file=sys.stderr)
    ee.Initialize(project="hack-506718")

    aoi = get_aoi_geometry(ee)

    # ── Load Sentinel-1 GRD ───────────────────────────────────────────────────
    s1 = ee.ImageCollection("COPERNICUS/S1_GRD") \
        .filterBounds(aoi) \
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH")) \
        .filter(ee.Filter.eq("instrumentMode", "IW")) \
        .select("VH")

    pre = s1.filterDate(PRE_START, PRE_END)
    post = s1.filterDate(POST_START, POST_END)

    pre_count = pre.size().getInfo()
    post_count = post.size().getInfo()
    print(f"  Pre-event images: {pre_count}, Post-event images: {post_count}", file=sys.stderr)

    if pre_count == 0 or post_count == 0:
        print("  Insufficient Sentinel-1 imagery — cannot compute flood detection", file=sys.stderr)
        print("  Retaining honest metricsUnavailableReason state", file=sys.stderr)
        return

    # ── Compute SAR change detection ──────────────────────────────────────────
    # Mean and standard deviation of pre-event VH
    pre_mean = pre.mean()
    pre_std = pre.reduce(ee.Reducer.stdDev())

    # Post-event mean VH
    post_mean = post.mean()

    # Flood mask: post_VH < pre_mean - threshold * std
    # Lower VH in post-event → inundation (water surface is smooth → low backscatter)
    flood_threshold = pre_mean.subtract(pre_std.multiply(FLOOD_THRESHOLD_SIGMA))
    flood_mask = post_mean.lt(flood_threshold).rename("flooded")
    flood_clipped = flood_mask.clip(aoi)

    # Also compute change magnitude for confidence
    change_db = post_mean.subtract(pre_mean).rename("change_db")

    combined = flood_clipped.addBands(change_db)
    print("  Flood detection computed", file=sys.stderr)

    # ── Load coastal H3 centroids ────────────────────────────────────────────
    centroids = load_h3_centroids(max_coastal_km=25)
    if not centroids:
        print("  No centroids — exiting", file=sys.stderr)
        return

    # ── Sample function ──────────────────────────────────────────────────────
    def sampler(fc):
        return combined.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),  # mean of flood mask = fraction flooded
            scale=30,
        )

    results = sample_in_batches(sampler, centroids, ee, batch_size=300, scale=30)

    # ── Extract flood values ──────────────────────────────────────────────────
    flood_data = {}
    for cell_id, props in results.items():
        flooded_frac = props.get("flooded")
        change = props.get("change_db")
        if flooded_frac is not None:
            flood_data[cell_id] = {
                # fraction of cell area flagged as flooded [0,1]
                "floodedFraction": round(float(flooded_frac), 4),
                # magnitude of SAR change (dB); negative = flooded
                "changeDb": round(float(change), 2) if change is not None else None,
                # binary flood flag (>50% of cell area)
                "isFlooded": bool(float(flooded_frac) > 0.5),
            }

    if not flood_data:
        print("  No flood data retrieved", file=sys.stderr)
        return

    flooded_cells = sum(1 for v in flood_data.values() if v["isFlooded"])
    print(f"  Flooded cells detected: {flooded_cells}/{len(flood_data)}", file=sys.stderr)

    # ── Write to ACTUAL directory (information firewall) ─────────────────────
    metadata = make_metadata(
        source_name="Copernicus Sentinel-1 GRD (ESA)",
        dataset_id="COPERNICUS/S1_GRD",
        reference_date=f"{POST_START}T00:00:00Z",
        spatial_resolution="10m Sentinel-1 GRD → aggregated to H3 resolution 8",
        license_str="Copernicus Sentinel data — ESA terms apply",
        source_url="https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD",
        processing_script="04_sentinel1_flood_actual.py",
        extra={
            "cellCount": len(flood_data),
            "floodedCells": flooded_cells,
            "preEventWindow": f"{PRE_START} to {PRE_END}",
            "postEventWindow": f"{POST_START} to {POST_END}",
            "method": "VH SAR change detection",
            "thresholdSigma": FLOOD_THRESHOLD_SIGMA,
            "FIREWALL": "ACTUAL POST-EVENT DATA — loaded only by explicit REVEAL step",
            "NOT_PREDICTION": "This file must never be imported into the T-24h prediction engine",
        },
    )
    write_actual("sentinel1_flood_extent.json", flood_data, metadata)
    print("  Sentinel-1 actual pipeline complete.", file=sys.stderr)
    print("  Flood extent stored in data/historical/fani/actual/", file=sys.stderr)
    print("  INFORMATION FIREWALL: This is NOT accessible before REVEAL ACTUAL step", file=sys.stderr)

if __name__ == "__main__":
    main()
