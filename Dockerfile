# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files first for layer-cached installs
COPY package.json pnpm-lock.yaml ./

# Install all deps (including devDeps for the build)
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Generate demo fixture if it doesn't exist
# (The fixture is committed, so this is a safety net)
RUN test -f data/fixtures/fani-demo/cells.geojson || pnpm generate:fixture

# Build the Next.js application (standalone output)
RUN pnpm build

# ── Stage 2: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (Next.js runtime + server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Copy static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy fixture data — required for offline Fani demo
# data/fixtures/ is committed and included in the build context
COPY --from=builder --chown=nextjs:nodejs /app/data/fixtures ./data/fixtures
# Copy any processed/derived assets (if present)
COPY --from=builder --chown=nextjs:nodejs /app/data/processed ./data/processed
# Copy post-event actual data — required for REVEAL phase (Sentinel-1 flood proxy)
# This file is committed (not gitignored) and must be present for evaluation metrics
COPY --from=builder --chown=nextjs:nodejs /app/data/historical ./data/historical

USER nextjs

EXPOSE 3000

# Health check for Cloud Run / orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q -O- http://localhost:3000/api/health || exit 1

# Start the standalone Next.js server
CMD ["node", "server.js"]
