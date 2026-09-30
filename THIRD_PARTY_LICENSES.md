# Third-Party Data, Services, and Licenses

This file must be updated whenever a new external data source or service is integrated.

---

## Data Sources

### WorldPop 2019 — Population Exposure

- Purpose: Population exposure per H3 cell
- Source: https://hub.worldpop.org/geodata/summary?id=6278
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Attribution: WorldPop (www.worldpop.org) — School of Geography and Environmental Science, University of Southampton; Department of Geography and Geosciences, University of Louisville; Departement de Geographie, Universite de Namur; Center for International Earth Science Information Network (CIESIN), Columbia University (2018). Global High Resolution Population Denominators Project — Funded by The Bill and Melinda Gates Foundation (OPP1134076). https://dx.doi.org/10.5258/SOTON/WP00532
- Usage: Population counts aggregated to H3 cells for the Odisha AOI. 2019 version used for Fani replay.

### OpenStreetMap — Roads and Infrastructure

- Purpose: Road network, critical infrastructure locations
- Source: https://www.openstreetmap.org
- Geofabrik extract: https://download.geofabrik.de/asia/india.html (January 2019 snapshot)
- License: Open Data Commons Open Database License (ODbL) 1.0
- Attribution: © OpenStreetMap contributors
- Usage: Clipped to Odisha AOI. January 2019 snapshot used for Fani replay to reflect pre-event state.

### Open Buildings Temporal — Building Exposure (NOT INTEGRATED)

- Purpose: Building footprint counts per H3 cell
- Source: https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Attribution: Google Research Open Buildings
- **Status: NOT INTEGRATED.** GEE authentication succeeded but the dataset
  is organized as S2-tile-level FeatureCollections requiring per-tile extraction
  that exceeded the scope of this pass. Building counts currently use the
  synthetic DEMO_FIXTURE values. If integrated in a future version, the 2019
  slice would be used.

### NASADEM — Elevation

- Purpose: Terrain elevation for surge screening and flood susceptibility
- Source: https://developers.google.com/earth-engine/datasets/catalog/NASA_NASADEM_HGT_001
- License: Public domain (NASA)
- Attribution: NASA / NASADEM Team
- Usage: Median elevation per H3 cell.

### GPM IMERG — Rainfall

- Purpose: Cyclone Fani event rainfall accumulation
- Source: https://developers.google.com/earth-engine/datasets/catalog/NASA_GPM_L3_IMERG_V07
- License: Public domain (NASA)
- Attribution: Huffman, G.J. et al. (2019). GPM IMERG Final Precipitation L3 Half Hourly 0.1 degree × 0.1 degree V07
- Usage: 24h and 48h accumulation for the Fani event period.

### CHIRPS v3 — Rainfall Baseline

- Purpose: Long-term rainfall baseline and anomaly
- Source: https://developers.google.com/earth-engine/datasets/catalog/UCSB-CHC_CHIRPS_V3_PENTAD
- License: Public domain (UCSB Climate Hazards Center)
- Attribution: Funk, C. et al. (2015). The climate hazards infrared precipitation with stations — a new environmental record for monitoring extremes. Scientific Data.

### Copernicus Emergency Management Service — Fani Validation (NOT INTEGRATED)

- Purpose: Post-event inundation and damage grading for Fani 2019 replay evaluation
- Activation: https://mapping.emergency.copernicus.eu/activations/EMSR357/
- License: Copernicus EMS — see https://emergency.copernicus.eu/mapping/ems-terms-service-open-data
- Attribution: Copernicus Emergency Management Service (Copernicus EMS) — EMSR357
- **Status: NOT INTEGRATED.** The activation page is publicly accessible (9 areas, 9 products).
  Products require manual download of shapefiles from individual product pages. No automated
  download path was available during this pass. Sentinel-1 SAR is used as the observed
  inundation proxy in place of Copernicus EMSR357 products.

### GDACS — Live Event Normalization

- Purpose: Global Disaster Alert and Coordination System live events
- Source: https://www.gdacs.org
- API docs: https://www.gdacs.org/gdacsapi/swagger/index.html
- License: GDACS terms — include source acknowledgement
- Usage: Normalizing live/near-live cyclone events into HazardScenario.

### ECMWF IFS via Open-Meteo — Meteorological Fallback

- Purpose: Precipitation, wind, pressure for live adapter fallback
- Source: https://open-meteo.com/en/docs/ecmwf-api
- License: CC BY 4.0 (verify current terms before submission)
- Attribution: Open-Meteo / ECMWF IFS
- Usage: Normalized into HazardScenario. Not presented as official IMD forecast.

### Sentinel-1 GRD — Post-event SAR Flood Validation

- Purpose: SAR-derived flood extent for Fani 2019 replay evaluation
- Source: https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S1_GRD
- License: Copernicus / ESA — see dataset page for terms
- Attribution: European Space Agency (ESA) / Copernicus Programme
- Usage: Post-event only. Never used in prediction pipeline (information firewall enforced).

---

## Software Libraries

### Next.js 16

- Source: https://nextjs.org
- License: MIT
- Version: 16.2.0

### React 19

- Source: https://react.dev
- License: MIT
- Version: 19.1.0

### MapLibre GL JS

- Source: https://maplibre.org
- License: BSD-3-Clause
- Version: 6.0.0

### OpenFreeMap

- Source: https://openfreemap.org
- Repository: https://github.com/hyperknot/openfreemap
- License: MIT (verify current terms before submission)
- Usage: Vector basemap tiles (public instance). No API key required.

### H3-js (Uber H3)

- Source: https://github.com/uber/h3-js
- License: Apache 2.0
- Version: 4.1.0

### Zod

- Source: https://zod.dev
- License: MIT
- Version: 4.6.0

### Zustand

- Source: https://github.com/pmndrs/zustand
- License: MIT
- Version: 5.0.15

### @turf/turf

- Source: https://turfjs.org
- License: MIT
- Version: 7.1.0

### @google/genai

- Source: https://ai.google.dev
- License: Apache 2.0
- Usage: Gemini API function calling and natural-language explanation. API key required.

### Google Earth Engine

- Source: https://developers.google.com/earth-engine
- License: Subject to GEE Terms of Service — https://developers.google.com/earth-engine/reference/Additional.API.Terms
- Usage: Preprocessing pipeline only. No runtime GEE dependency in the demo.

---

## Explicitly excluded

### OSRM
Not used. Full network routing is explicitly out of scope.

### Firebase Cloud Messaging
Not used. FCM is not designed for emergency/life-critical messaging.

### Real insurer / insurance contract
Not used. Insurance output is illustrative only — no real contract or payout.
