# pipelines/gee/

Google Earth Engine preprocessing pipeline.

Runs **once** to export compact derived assets.
Do not run GEE computations on every user request.
Do not make GEE runtime access a demo dependency.

## Prerequisites

- GEE account registered: https://earthengine.google.com
- `earthengine` CLI authenticated: `earthengine authenticate`
- `EARTHENGINE_PROJECT` set in `.env.local`

## Scripts (Phase 2)

| Script | Description | Output |
|--------|-------------|--------|
| `01_worldpop_aggregation.js` | Aggregate WorldPop 2019 to H3 res-8 cells | `data/processed/worldpop_h3_r8.json` |
| `02_open_buildings.js` | Aggregate Open Buildings 2019 | `data/processed/buildings_h3_r8.json` |
| `03_nasadem_elevation.js` | Median NASADEM elevation per H3 cell | `data/processed/elevation_h3_r8.json` |
| `04_gpm_imerg_fani.js` | GPM IMERG event rainfall accumulation | `data/processed/gpm_imerg_fani_48h.json` |
| `05_sentinel1_postfani.js` | Sentinel-1 post-event SAR flood extent | `data/historical/fani/actual/sentinel1_flood_extent.geojson` |
| `06_chirps_baseline.js` | CHIRPS long-term rainfall baseline | `data/processed/chirps_baseline.json` |
| `07_coastal_proximity.js` | Distance to coastline per H3 cell | `data/processed/coastal_proximity_h3_r8.json` |

## Output format

All H3 outputs: GeoJSON FeatureCollection with H3 cell polygons as features.

Each feature `properties` must include the `DataContract` metadata block:
```json
{
  "source": "...",
  "sourceUrl": "...",
  "referenceDate": "...",
  "processingDate": "...",
  "spatialResolution": "H3-r8",
  "aoi": "Odisha coastal corridor",
  "version": "...",
  "license": "...",
  "processingScript": "..."
}
```

## AOI bounds

`[83.5, 17.5, 87.5, 22.0]` (minLng, minLat, maxLng, maxLat)

Do not ship raw national-scale datasets. Clip to AOI before export.
Target compressed size: < 100 MB total for all processed assets.
