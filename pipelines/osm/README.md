# pipelines/osm/

OpenStreetMap January 2019 infrastructure extraction pipeline.

Used for Fani replay — snapshot is from before the event.

## Source

Geofabrik India extract (January 2019):
https://download.geofabrik.de/asia/india.html

Use the January 2019 snapshot (not current data).

## Processing steps (Phase 2)

1. Download India OSM `.osm.pbf` for January 2019
2. Clip to AOI bbox: `[83.5, 17.5, 87.5, 22.0]`
3. Extract infrastructure by tag:
   - `amenity=hospital`
   - `amenity=clinic`, `amenity=health_post`
   - `emergency=yes` (emergency services)
   - `amenity=shelter` / `cyclone_shelter=yes`
   - `highway=primary`, `highway=trunk` (arterial roads)
   - `bridge=yes` (bridges on major roads)
   - `power=substation`, `power=plant` (power infrastructure)
   - `man_made=water_works`, `amenity=water_point` (water)
   - `amenity=school` (schools as evacuation points)
4. Convert to GeoJSON
5. Assign asset types per `InfrastructureAssetType`
6. Apply default criticality and vulnerability from `src/config/index.ts`
7. Validate with `InfrastructureAssetSchema`
8. Output: `data/fixtures/fani-demo/infrastructure.geojson`

## License

OpenStreetMap data © OpenStreetMap contributors.
License: ODbL 1.0 — https://opendatacommons.org/licenses/odbl/1-0/

Include attribution in `THIRD_PARTY_LICENSES.md` and in the UI footer.
