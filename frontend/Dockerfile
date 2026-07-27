# Next.js 15 frontend for LifeOS
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_ vars must be present at build time.
ARG NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
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
