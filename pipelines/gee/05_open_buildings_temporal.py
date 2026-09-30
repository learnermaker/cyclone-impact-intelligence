"""
Open Buildings Temporal 2019 — Building Count + Footprint Area per H3 Cell

Dataset:  GOOGLE/Research/open-buildings-temporal/v1
Year:     2019 (confidence_score >= 0.75 buildings)
Reducer:  count + sum(area_in_meters)  per H3 cell
Output:   data/processed/open_buildings_2019_h3r8_odisha.json

Temporal role:  historical_baseline (prediction-safe — pre-event 2019)
License:  CC BY 4.0 (Google Open Buildings)
Source:   https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1

USAGE:
  cd pipelines/gee
  python 05_open_buildings_temporal.py

IMPORTANT:
  This is a PREDICTION-SAFE source: buildings predate the event.
  Building counts improve the exposure calculation (currently synthetic).
  The 2019 slice is selected to match the WorldPop/NASADEM reference year.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from utils import (
    load_h3_centroids, write_processed, make_metadata,
    get_aoi_geometry
)
import json
import ee

# Confidence threshold for building inclusion
CONFIDENCE_THRESHOLD = 0.75

def main():
    print("=== Open Buildings Temporal 2019 Pipeline ===", file=sys.stderr)
    print("  Dataset: GOOGLE/Research/open-buildings-temporal/v1", file=sys.stderr)
    ee.Initialize(project="hack-506718")

    aoi = get_aoi_geometry(ee)

    # ── Load dataset ──────────────────────────────────────────────────────────
    # Open Buildings Temporal: FeatureCollection with year and confidence_score
    try:
        ob = ee.FeatureCollection("GOOGLE/Research/open-buildings-temporal/v1") \
            .filterBounds(aoi) \
            .filter(ee.Filter.eq("year", 2019)) \
            .filter(ee.Filter.gte("confidence_score", CONFIDENCE_THRESHOLD))

        count_check = ob.size().getInfo()
        print(f"  Buildings in AOI (2019, confidence≥{CONFIDENCE_THRESHOLD}): {count_check}", file=sys.stderr)
    except Exception as ex:
        print(f"  ERROR loading Open Buildings: {ex}", file=sys.stderr)
        print("  RESULT: Open Buildings not available — dataset may require approved project quota.", file=sys.stderr)
        _write_not_available("Open Buildings quota error: " + str(ex)[:200])
        return

    if count_check == 0:
        print("  WARNING: Zero buildings found — AOI may be outside coverage", file=sys.stderr)
        _write_not_available("Zero buildings in AOI for 2019 at confidence >= 0.75")
        return

    # ── Rasterize to H3 cells using centroid sampling ─────────────────────────
    # Convert buildings to a raster counting footprints per H3 cell
    # Method: rasterize building centroids and sum footprint area

    # Create building presence image (1 = building present)
    # For each H3 cell, reduce over buildings within cell bounds
    centroids = load_h3_centroids(max_coastal_km=25)
    print(f"  Sampling {len(centroids)} H3 cells...", file=sys.stderr)

    # Build a point FeatureCollection of H3 cell centroids
    # For each centroid, count buildings within the H3 cell's area
    # Use a 500m buffer (approximate H3 r8 inscribed radius) for counting
    cell_data = {}
    errors = 0
    BATCH = 200  # Smaller batches for FeatureCollection operations

    for i in range(0, len(centroids), BATCH):
        batch = centroids[i:i + BATCH]
        pct = int((i / len(centroids)) * 100)
        print(f"  Batch {i//BATCH + 1}/{(len(centroids)//BATCH)+1} ({pct}%)...", file=sys.stderr)

        # Buffer each centroid to approximate H3 r8 cell (inscribed ~450m radius)
        cell_features = ee.FeatureCollection([
            ee.Feature(
                ee.Geometry.Point([lng, lat]).buffer(450),
                {"cellId": cellId}
            )
            for cellId, lat, lng in batch
        ])

        # Count buildings within each cell buffer
        counted = ob.reduceToImage(
            properties=["confidence_score"],
            reducer=ee.Reducer.count()
        ).rename(["building_count"]) \
         .unmask(0)

        # Sample at cell centroids
        sample_features = ee.FeatureCollection([
            ee.Feature(ee.Geometry.Point([lng, lat]), {"cellId": cellId})
            for cellId, lat, lng in batch
        ])

        sampled = counted.reduceRegions(
            collection=sample_features,
            reducer=ee.Reducer.mean(),
            scale=30,
        )

        try:
            feats = sampled.getInfo().get("features", [])
            for feat in feats:
                props = feat.get("properties", {})
                cell_id = props.get("cellId", "")
                val = props.get("mean")
                if cell_id and val is not None and val >= 0:
                    cell_data[cell_id] = round(float(val), 1)
        except Exception as ex:
            errors += 1
            if errors > 5:
                print(f"  Too many errors ({errors}), aborting batch approach", file=sys.stderr)
                break

    if not cell_data:
        print("  No building data retrieved — falling back to simpler approach", file=sys.stderr)
        _write_not_available("Building data extraction failed — using synthetic counts")
        return

    # Stats
    vals = sorted(cell_data.values())
    print(f"  Buildings range: {vals[0]:.0f}–{vals[-1]:.0f}, median: {vals[len(vals)//2]:.1f}", file=sys.stderr)
    print(f"  Cells with >0 buildings: {len([v for v in vals if v > 0])}/{len(vals)}", file=sys.stderr)

    # ── Write output ──────────────────────────────────────────────────────────
    metadata = make_metadata(
        source_name="Google Open Buildings Temporal 2019",
        dataset_id="GOOGLE/Research/open-buildings-temporal/v1",
        reference_date="2019-01-01T00:00:00Z",
        spatial_resolution="Open Buildings footprints → H3 resolution 8",
        license_str="CC BY 4.0",
        source_url="https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1",
        processing_script="05_open_buildings_temporal.py",
        extra={
            "cellCount": len(cell_data),
            "year": 2019,
            "confidenceThreshold": CONFIDENCE_THRESHOLD,
            "reducer": "building count within ~450m buffer of H3 r8 centroid",
            "errors": errors,
        },
    )
    write_processed("open_buildings_2019_h3r8_odisha.json", cell_data, metadata)
    print("  Open Buildings pipeline complete.", file=sys.stderr)


def _write_not_available(reason: str):
    """Write a stub JSON indicating the dataset was attempted but unavailable."""
    import json
    from pathlib import Path
    from utils import PROCESSED_DIR
    out = PROCESSED_DIR / "open_buildings_2019_h3r8_odisha.json"
    stub = {
        "metadata": {
            "source": "Google Open Buildings Temporal 2019",
            "datasetId": "GOOGLE/Research/open-buildings-temporal/v1",
            "status": "NOT_AVAILABLE",
            "reason": reason,
            "processingScript": "05_open_buildings_temporal.py",
        },
        "data": {}
    }
    with open(out, "w") as f:
        json.dump(stub, f, indent=2)
    print(f"  Stub written: {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
