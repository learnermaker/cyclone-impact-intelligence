# Cloud Run Deployment — Reference Values

Use these exact values when filling in the GCP Console forms.

## Service settings

| Field | Value |
|-------|-------|
| Service name | `cyclone-impact-intelligence` |
| Region | `asia-south1` (Mumbai) |
| CPU | **2** |
| Memory | **2 GiB** |
| Min instances | **1** (avoids cold-start during demo) |
| Max instances | **5** |
| Request timeout | **300 s** |
| Port | **3000** |
| Ingress | Allow all traffic |
| Authentication | Allow unauthenticated invocations |

## Environment variables (plain — not secrets)

| Key | Value |
|-----|-------|
| `GEMINI_MODEL` | `gemini-3.8-flash` |
| `MAP_STYLE_URL` | `https://tiles.openfreemap.org/styles/liberty` |
| `LOG_LEVEL` | `info` |

## Secret (Secret Manager — never plain env var)

| Secret name | Mounted as env var |
|-------------|-------------------|
| `GEMINI_API_KEY` | `GEMINI_API_KEY` |

## Health check

`GET /api/health` — returns `{"ok":true,"geminiStatus":"CONFIGURED",...}`

## Fixture / data files

The fixture (`data/fixtures/fani-demo/cells.geojson`, ~43k cells) and all GEE-derived
assets are committed to the repository and baked into the container image at build time.
No runtime GEE dependency. No external database.
