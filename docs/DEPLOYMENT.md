# Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 22.0.0 | LTS recommended |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm` |
| Docker | ≥ 24 | For containerized deployment |
| Google Cloud SDK | latest | For Cloud Run |

## Local Development

```bash
# 1. Clone and install
git clone <repo>
cd cyclone-impact-intelligence
pnpm install

# 2. Generate the Fani demo fixture (43,009 H3 cells, ~24 MB)
pnpm generate:fixture

# 3. Copy environment template
cp .env.example .env.local
# Edit .env.local — only GEMINI_API_KEY is needed for full AI features.
# All other settings have working defaults.

# 4. Start development server
pnpm dev
# Open http://localhost:3000
# App redirects to /app/replay — the Fani T-24h demo
```

## Environment Variables

See [`.env.example`](.env.example) for all variables. The only variable that changes functionality:

| Variable | Default | Effect |
|---|---|---|
| `GEMINI_API_KEY` | (empty) | Gemini AI explanation. App works without it — uses deterministic fallback. |
| `GEMINI_MODEL` | `gemini-3.7-flash` | Override if model ID changes |
| `MAP_STYLE_URL` | OpenFreeMap | Alternative basemap tile URL |
| `DISPATCH_WEBHOOK_URL` | `http://localhost:3000/api/webhook/receive` | Advisory dispatch target |

All other variables are optional enhancements.

## Production Build

```bash
# Type-check
pnpm type-check

# Run tests
pnpm test

# Build production bundle (Next.js standalone)
pnpm build

# Start production server
pnpm start
```

## Docker Build and Run

```bash
# Build Docker image
docker build -t cyclone-impact-intelligence .

# Run locally
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key_here \
  cyclone-impact-intelligence

# With all optional env vars
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_key_here \
  -e GEMINI_MODEL=gemini-3.7-flash \
  -e MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty \
  cyclone-impact-intelligence

# Verify health
curl http://localhost:3000/api/health
```

## Cloud Run Deployment

### 1. Set up Google Cloud

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Enable required services
gcloud services enable run.googleapis.com containerregistry.googleapis.com
```

### 2. Build and push container

```bash
# Configure Docker for GCR
gcloud auth configure-docker

# Build and tag
docker build -t gcr.io/YOUR_PROJECT_ID/cyclone-impact-intelligence .
docker push gcr.io/YOUR_PROJECT_ID/cyclone-impact-intelligence
```

### 3. Deploy to Cloud Run

```bash
gcloud run deploy cyclone-impact-intelligence \
  --image gcr.io/YOUR_PROJECT_ID/cyclone-impact-intelligence \
  --platform managed \
  --region asia-south1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 3 \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --set-env-vars MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
```

### 4. Configure secrets (Cloud Run Secret Manager)

```bash
# Create secret for Gemini API key
echo "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-

# Grant Cloud Run access
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:$(gcloud run services describe cyclone-impact-intelligence --format='value(spec.template.spec.serviceAccountName)')" \
  --role="roles/secretmanager.secretAccessor"
```

## Demo Reliability Test

Before declaring deployment complete, verify the offline demo:

```bash
# 1. Disable Gemini (no API key)
# 2. Run
GEMINI_API_KEY= pnpm start

# 3. Open http://localhost:3000
# 4. Verify:
#   - App loads
#   - LIVE mode shows "no active event"
#   - Fani Replay launches
#   - Priority list appears
#   - "Why?" returns deterministic fallback (not Gemini)
#   - Scenario controls work
#   - Advisory generates without Gemini
#   - Reveal shows metricsUnavailableReason (not fabricated metrics)
```

## Scaling Notes

The primary demo uses a 24 MB fixture loaded into memory on first request. On Cloud Run:
- Cold start: ~3-5 seconds (fixture load)
- Warm requests: ~200-500ms
- Fixture fits easily within 2 GB memory limit
- For high traffic: increase instances and use Cloud Run's minimum instances to avoid cold starts

## Credential-Only Remaining Actions

After local Docker build verification, the following actions require user credentials:

1. `gcloud auth login` — Google Cloud authentication
2. GEE registration at https://earthengine.google.com — for running preprocessing pipelines
3. Gemini API key at https://ai.google.dev — for AI features
4. Cloud Run deployment IAM permissions
