"""
GEE Pipeline Utilities
Shared helpers for all GEE sampling scripts.
"""

import json
import os
import sys
from pathlib import Path

# ── Paths ────────────────────────────────────────────────────────────────────

REPO_ROOT = Path(__file__).parent.parent.parent
FIXTURE_PATH = REPO_ROOT / "data" / "fixtures" / "fani-demo" / "cells.geojson"
PROCESSED_DIR = REPO_ROOT / "data" / "processed"
ACTUAL_DIR = REPO_ROOT / "data" / "historical" / "fani" / "actual"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
ACTUAL_DIR.mkdir(parents=True, exist_ok=True)

# ── AOI ──────────────────────────────────────────────────────────────────────

# Puri/Khurda/Ganjam coastal corridor (matches pipelines/gee/README.md)
AOI_COORDS = [
    [84.8, 19.2], [86.8, 19.2], [86.8, 20.7], [84.8, 20.7], [84.8, 19.2]
]

def get_aoi_geometry(ee):
    """Return an EE Geometry for the AOI."""
    return ee.Geometry.Polygon(AOI_COORDS)

# ── Coastal zone filter (most relevant cells) ─────────────────────────────────

COASTAL_PROXIMITY_KM_MAX = 25  # Only process cells within this distance of coast

# ── H3 centroid extraction ───────────────────────────────────────────────────

def load_h3_centroids(max_coastal_km=COASTAL_PROXIMITY_KM_MAX):
    """
    Read cells.geojson and return a list of (cellId, lat, lng) tuples
    for land cells within max_coastal_km of the coast.

    Filtered to the coastal zone to stay within GEE's practical limits.
    """
    print(f"Loading H3 centroids from {FIXTURE_PATH} ...", file=sys.stderr)
    with open(FIXTURE_PATH, "r") as f:
        geojson = json.load(f)

    centroids = []
    for feat in geojson["features"]:
        props = feat.get("properties", {})
        if not props.get("isLand", False):
            continue
        susc = props.get("susceptibility", {})
        if susc.get("coastalProximityKm", 999) > max_coastal_km:
            continue

        # Center coordinates computed from polygon ring
        coords = feat["geometry"]["coordinates"][0]  # outer ring [lng, lat]
        lng = sum(p[0] for p in coords) / len(coords)
        lat = sum(p[1] for p in coords) / len(coords)
        centroids.append((feat["id"], lat, lng))

    print(f"  {len(centroids)} coastal land cells selected", file=sys.stderr)
    return centroids

# ── GEE batching ─────────────────────────────────────────────────────────────

def sample_in_batches(image_or_reducer_fn, centroids, ee, batch_size=400, scale=100, extra_props=None):
    """
    Sample an EE image at H3 centroids in batches to avoid GEE size limits.

    Returns a dict: {cellId: property_dict}
    """
    results = {}
    total = len(centroids)

    for i in range(0, total, batch_size):
        batch = centroids[i:i + batch_size]
        pct = int((i / total) * 100)
        print(f"  Sampling batch {i//batch_size + 1}/{(total//batch_size)+1} ({pct}%)...", file=sys.stderr)

        features = [
            ee.Feature(ee.Geometry.Point([lng, lat]), {"cellId": cellId})
            for cellId, lat, lng in batch
        ]
        fc = ee.FeatureCollection(features)

        sampled = image_or_reducer_fn(fc)

        try:
            info = sampled.getInfo()
            for feat in info.get("features", []):
                cell_id = feat["properties"].get("cellId")
                if cell_id:
                    results[cell_id] = feat["properties"]
        except Exception as e:
            print(f"  Batch {i//batch_size + 1} failed: {e}", file=sys.stderr)
            continue

    print(f"  Got values for {len(results)}/{total} cells", file=sys.stderr)
    return results

# ── Output helpers ────────────────────────────────────────────────────────────

def write_processed(filename, data_dict, metadata):
    """
    Write processed GEE data to data/processed/.
    Format: { "metadata": {...}, "data": {cellId: value} }
    """
    output = {"metadata": metadata, "data": data_dict}
    path = PROCESSED_DIR / filename
    with open(path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    size_kb = path.stat().st_size // 1024
    print(f"  Written: {path} ({size_kb} KB, {len(data_dict)} cells)", file=sys.stderr)
    return str(path)

def write_actual(filename, data_dict, metadata):
    """
    Write actual post-event data to data/historical/fani/actual/.
    INFORMATION FIREWALL: never merged into prediction dataset.
    """
    output = {"metadata": metadata, "data": data_dict}
    path = ACTUAL_DIR / filename
    with open(path, "w") as f:
        json.dump(output, f, separators=(",", ":"))
    size_kb = path.stat().st_size // 1024
    print(f"  Written (ACTUAL): {path} ({size_kb} KB, {len(data_dict)} cells)", file=sys.stderr)
    return str(path)

# ── Standard provenance template ──────────────────────────────────────────────

from datetime import datetime, timezone

def make_metadata(
    source_name, dataset_id, reference_date, spatial_resolution,
    license_str, source_url, processing_script, extra=None
):
    meta = {
        "source": source_name,
        "datasetId": dataset_id,
        "referenceDate": reference_date,
        "processingDate": datetime.now(timezone.utc).isoformat(),
        "spatialResolution": spatial_resolution,
        "aoi": "Puri/Khurda/Ganjam coastal corridor, Odisha, India",
        "h3Resolution": 8,
        "maxCoastalProximityKm": COASTAL_PROXIMITY_KM_MAX,
        "license": license_str,
        "sourceUrl": source_url,
        "processingScript": f"pipelines/gee/{processing_script}",
        "project": "hack-506718",
        "tier": "GEE_DERIVED",
    }
    if extra:
        meta.update(extra)
    return meta
