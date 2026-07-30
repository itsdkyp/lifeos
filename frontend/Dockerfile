# Next.js 16 frontend for LifeOS
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_ vars must be present at build time.
# NEXT_PUBLIC_LIFEOS_TOKEN is OPTIONAL — if you'd rather have every browser paste the
# token via Settings -> Security (recommended), leave this blank at build time.
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
ARG NEXT_PUBLIC_LIFEOS_TOKEN=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LIFEOS_TOKEN=$NEXT_PUBLIC_LIFEOS_TOKEN
RUN bun run build

FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/.next        ./.next
COPY --from=build /app/public       ./public
COPY --from=build /app/package.json ./
COPY --from=build /app/next.config.ts ./
EXPOSE 3000
CMD ["bun", "run", "start"]
