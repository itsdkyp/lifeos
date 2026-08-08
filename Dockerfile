# LifeOS single-container image.
# Runs both the Hono backend (bound to loopback) and the Next.js frontend (public :3000),
# so only ONE port needs to be exposed and the backend never touches the network.
#
# Layout when running:
#   /app/backend/   Hono API on 127.0.0.1:8787 (loopback only)
#   /app/frontend/  Next.js on 0.0.0.0:3000    (the exposed port)
#   /data/lifeos.db SQLite database (persistent volume)
#
# The frontend proxies /_lifeos-api/* to the backend via next.config.ts rewrites,
# so the browser talks to one origin. See backend/src/index.ts LIFEOS_BIND for the
# tightened loopback default, and lib/api.ts for the client-side URL logic.

# ── Stage 1: backend deps ────────────────────────────────────────────────────
FROM oven/bun:1.3 AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock* ./
RUN bun install --frozen-lockfile

# ── Stage 2: frontend build ──────────────────────────────────────────────────
FROM oven/bun:1.3 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
# NEXT_PUBLIC_API_URL is intentionally empty: the browser uses the same-origin
# /_lifeos-api prefix from lib/api.ts, and next.config.ts rewrites it internally.
ENV NEXT_PUBLIC_API_URL=""
RUN bun run build

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM oven/bun:1.3
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV LIFEOS_BIND=127.0.0.1
ENV DB_PATH=/data/lifeos.db
ENV LIFEOS_BACKEND_INTERNAL_URL=http://127.0.0.1:8787

# Backend: source + prebuilt node_modules
COPY --from=backend-deps  /app/backend/node_modules  ./backend/node_modules
COPY backend/                                        ./backend/

# Frontend: build output + minimal runtime deps
COPY --from=frontend-build /app/frontend/.next          ./frontend/.next
COPY --from=frontend-build /app/frontend/public         ./frontend/public
COPY --from=frontend-build /app/frontend/package.json   ./frontend/
COPY --from=frontend-build /app/frontend/next.config.ts ./frontend/
COPY --from=frontend-build /app/frontend/node_modules   ./frontend/node_modules

# The tiny supervisor: starts backend, waits for /health, then starts frontend.
# Trap SIGTERM/SIGINT so `docker stop` shuts both down cleanly instead of hard-killing.
COPY <<'EOF' /app/entrypoint.sh
#!/usr/bin/env bash
set -euo pipefail

prefix() { sed -u "s/^/[${1}] /"; }

echo "[lifeos] starting backend on 127.0.0.1:${PORT:-8787}"
( cd /app/backend && bun run src/index.ts ) 2>&1 | prefix backend &
BACKEND_PID=$!

# Wait for the backend /health probe to return 200 before starting the frontend.
# Timeout after 30s so a stuck backend doesn't hide behind an infinite loop.
for i in $(seq 1 30); do
  if bun -e "fetch('http://127.0.0.1:${PORT:-8787}/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[lifeos] backend healthy after ${i}s"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "[lifeos] backend never came up in 30s, aborting"
    kill -TERM $BACKEND_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

echo "[lifeos] starting frontend on 0.0.0.0:3000"
( cd /app/frontend && bun run start -- -H 0.0.0.0 -p 3000 ) 2>&1 | prefix frontend &
FRONTEND_PID=$!

# Forward SIGTERM/SIGINT to both children, then wait for them to exit.
shutdown() {
  echo "[lifeos] received shutdown signal, stopping processes"
  kill -TERM "$FRONTEND_PID" 2>/dev/null || true
  kill -TERM "$BACKEND_PID"  2>/dev/null || true
  wait "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID"  2>/dev/null || true
  echo "[lifeos] shut down cleanly"
}
trap shutdown SIGTERM SIGINT

# If either child exits early, tear the other one down and exit with the failure code.
wait -n "$FRONTEND_PID" "$BACKEND_PID"
EXIT=$?
shutdown
exit $EXIT
EOF
RUN chmod +x /app/entrypoint.sh

VOLUME ["/data"]
EXPOSE 3000

# Healthcheck against the public port — /health passes through the Next.js rewrite
# to the backend, so a passing check proves BOTH processes are alive.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD bun -e "fetch('http://127.0.0.1:3000/_lifeos-api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["/app/entrypoint.sh"]
