# pipelines/copernicus/

Copernicus EMS EMSR357 actual impact data processing pipeline.

## Source

Activation: https://mapping.emergency.copernicus.eu/activations/EMSR357/

This activation contains actual inundation and damage grading products
for Cyclone Fani 2019 across Odisha Coast, Bhubaneswar, Gopalpur, Puri, etc.

## CRITICAL: Information Firewall

All outputs from this pipeline go to `data/historical/fani/actual/` ONLY.

**Never import from this directory in the prediction engine.**

The `validatePredictionFirewall()` function guards against this at runtime.

## Processing steps (Phase 2)

1. Download GeoPackage/SHP products from the EMSR357 activation page
2. Select relevant area: Odisha coastal corridor
3. Convert to GeoJSON (WGS84 / EPSG:4326)
4. Clip to AOI bbox: `[83.5, 17.5, 87.5, 22.0]`
5. Run `validate_geometry.py` to check for invalid geometries
6. Place in `data/historical/fani/actual/`
7. Create `actual_metadata.json` with provenance

## Required outputs

| File | Copernicus product |
|------|-------------------|
| `copernicus_emsr357_inundation.geojson` | Reference/Monitoring maps (inundation polygons) |
| `copernicus_emsr357_grading.geojson` | Grading maps (damage classification) |

## Attribution

Copernicus Emergency Management Service (Copernicus EMS).
Follow Copernicus attribution and licensing requirements.
See: https://emergency.copernicus.eu/mapping/ems-terms-service-open-data
