# Bun backend for LifeOS
# Multi-stage: install deps -> run.
# Data (lifeos.db) lives in a mounted volume; the vault is bind-mounted if provided.

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
# Inside the container, bind to all interfaces. The docker-compose port mapping
# still controls whether the port is exposed on the host.
ENV LIFEOS_BIND=0.0.0.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# lifeos.db is written to /data (volume-mounted, persistent).
ENV DB_PATH=/data/lifeos.db
VOLUME ["/data"]
EXPOSE 8787

# Bun ships wget-less; use bun itself for the healthcheck so it works on any base image.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:8787/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["bun", "run", "src/index.ts"]
