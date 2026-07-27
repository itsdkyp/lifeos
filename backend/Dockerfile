# Bun backend for LifeOS
# Multi-stage: install deps → run.
# Data (lifeos.db) lives in a mounted volume; the vault is bind-mounted read/write.

FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# lifeos.db is written to /data (volume-mounted).
ENV DB_PATH=/data/lifeos.db
VOLUME ["/data"]
EXPOSE 8787
CMD ["bun", "run", "src/index.ts"]
