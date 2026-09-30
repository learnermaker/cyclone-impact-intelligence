# Deployment Guide

## Local Development

```bash
git clone https://github.com/learnermaker/cyclone-impact-intelligence.git
cd cyclone-impact-intelligence
pnpm install          # postinstall copies MapLibre worker files to public/

cp .env.example .env.local
# Edit .env.local — set GEMINI_API_KEY for AI features
# App works without it (deterministic fallback activates)

pnpm dev              # http://localhost:3000  →  /app/replay
```

---

## Cloud Run Deployment

### Prerequisites

| Tool | Notes |
|------|-------|
| Google Cloud SDK (`gcloud`) | [Install](https://cloud.google.com/sdk/docs/install) |
| A GCP project | Billing enabled |
| A Gemini API key | [ai.google.dev](https://ai.google.dev/gemini-api/docs/api-key) |

You do **not** need Docker installed locally. Cloud Build builds the image.

---

### Step 1 — Set your project

```bash
export PROJECT_ID=your-project-id    # replace with your GCP project ID
export REGION=asia-south1            # Mumbai — change if needed

gcloud config set project $PROJECT_ID
```

---

### Step 2 — Enable required APIs (once per project)

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

---

### Step 3 — Store Gemini API key in Secret Manager

```bash
# Create the secret — paste your key when prompted, then Ctrl+D
echo "YOUR_GEMINI_API_KEY_HERE" | \
  gcloud secrets create GEMINI_API_KEY \
  --data-file=- \
  --replication-policy=automatic \
  --project=$PROJECT_ID
```

> **Do not** pass the API key as a plain env var (`--set-env-vars`).
> Always use Secret Manager so the key is never visible in deployment logs.

---

### Step 4 — Grant Cloud Run access to the secret

The Cloud Run service runs as the default Compute Engine service account.
Grant it access to the secret:

```bash
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor" \
  --project=$PROJECT_ID
```

> If you created a dedicated service account for Cloud Run, use that instead.

---

### Step 5 — Deploy (source → Cloud Build → Cloud Run)

Run this from the repository root. Cloud Build builds the Docker image from the
`Dockerfile` and pushes it to Artifact Registry, then deploys it to Cloud Run.
No local Docker required.

```bash
gcloud run deploy cyclone-impact-intelligence \
  --source . \
  --project  $PROJECT_ID \
  --region   $REGION \
  --allow-unauthenticated \
  --memory   2Gi \
  --cpu       2 \
  --max-instances 5 \
  --min-instances 1 \
  --timeout  300 \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest" \
  --set-env-vars "GEMINI_MODEL=gemini-3.8-flash,MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty,LOG_LEVEL=info"
```

Cloud Build takes ~4–6 minutes on first run. Subsequent deploys are faster.

After deploy, `gcloud` prints the service URL, e.g.:
```
Service URL: https://cyclone-impact-intelligence-xxxxxxxxxxxx-el.a.run.app
```

---

### Step 6 — Verify the deployment

```bash
SERVICE_URL=$(gcloud run services describe cyclone-impact-intelligence \
  --region $REGION --format="value(status.url)")

# Health check
curl "${SERVICE_URL}/api/health"
# Expected: {"ok":true,"status":"healthy","geminiStatus":"CONFIGURED",...}

# Open in browser
echo "Open: ${SERVICE_URL}"
```

The app redirects to `/app/replay` — the Fani 2019 T-24h demo.

---

### Step 7 — Update dispatch webhook URL (optional)

The advisory dispatch webhook defaults to `http://localhost:3000/api/webhook/receive`
(works because the container calls itself). If you want the external URL:

```bash
gcloud run services update cyclone-impact-intelligence \
  --region $REGION \
  --update-env-vars "DISPATCH_WEBHOOK_URL=${SERVICE_URL}/api/webhook/receive"
```

---

## Updating the deployment

Every new push: re-run Step 5 from the repo root. Cloud Run performs a
zero-downtime rolling update.

```bash
# After any code change
gcloud run deploy cyclone-impact-intelligence \
  --source . \
  --project $PROJECT_ID \
  --region  $REGION
# (all other flags are retained from the previous deploy)
```

---

## Resource sizing

| Setting | Value | Why |
|---------|-------|-----|
| Memory | 2 Gi | Fixture (43k cells) loads into memory on first request |
| CPU | 2 | Engine runs synchronously on request; 2 vCPU prevents queueing |
| Min instances | 1 | Avoids cold-start delay during demo |
| Max instances | 5 | Prevents runaway billing on spike |
| Timeout | 300s | Gemini function-calling loop can take up to ~30s; Next.js default is 60s |

---

## Cold start behaviour

- First request after a cold start: **~3–5 seconds** (fixture load + style compile)
- Warm requests: **~200–500 ms**
- With `--min-instances 1`, the container stays warm and cold starts are avoided

---

## Local Docker build (optional, requires Docker Desktop)

If you want to test the container image locally before deploying:

```bash
# Build
docker build -t cyclone-impact-intelligence .

# Run with your Gemini key
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key_here \
  -e GEMINI_MODEL=gemini-3.8-flash \
  cyclone-impact-intelligence

# Health check
curl http://localhost:3000/api/health
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `geminiStatus: "UNCONFIGURED"` | Secret not mounted; re-check Steps 3–5 |
| Map tiles not loading | `MAP_STYLE_URL` env var missing; add it in Step 5 |
| Cold start >10s | Add `--min-instances 1` to keep container warm |
| `permission denied` on secret | Service account doesn't have `secretAccessor` role; re-run Step 4 |
| Build fails on `pnpm generate:fixture` | The fixture is committed; this should be a no-op. Check `data/fixtures/fani-demo/cells.geojson` exists in the repo. |
| `ENOSPC` during Cloud Build | Increase Cloud Build machine type: add `--machine-type=E2_HIGHCPU_8` |
