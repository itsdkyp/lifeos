# LifeOS

Personal life tracker: journal, finance, mood, time, pomodoro, LLM chat over your own data.
Syncs everything to your Obsidian vault as daily markdown files.

**Stack:** Bun + Hono + SQLite backend · Next.js 16 + Tailwind v4 + shadcn/ui frontend · direct LLM providers (GitHub Copilot, OpenAI, Anthropic, Gemini, Groq, Ollama, OpenRouter, Mistral, DeepSeek, custom OpenAI-compatible).

---

## Quick start

### 0. Prereqs (one-time)

```bash
# Bun (backend + frontend runtime)
curl -fsSL https://bun.sh/install | bash

# LiteLLM proxy — install one way:
pip install 'litellm[proxy]'        # local
# OR: use the docker-compose service (no install needed)
```

### 1. Configure

```bash
cd ~/Desktop/Projects/lifeos
cp backend/.env.example backend/.env
# Edit VAULT_PATH if different from the default.
```

### 2. Install deps

```bash
make install
```

### 3. Run (3 terminals)

```bash
make proxy      # LiteLLM     :4000
make backend    # Hono API    :8787
make frontend   # Next.js UI  :3000
```

Open http://localhost:3000

**First LLM call** triggers GitHub Copilot OAuth: LiteLLM prints a URL + device code — visit `github.com/login/device`, paste, done. Token cached at `~/.config/litellm/`.

### Or: Docker (one command)

See the **Docker** section below.

---

## Docker

One image, one port, one command. A single `Dockerfile` + `docker-compose.yml` ship in the repo.
Recommended for any remote-access setup (VPS, home server, Synology, Raspberry Pi 4+,
Tailscale exit node) because you don't have to keep a laptop awake, and the surface area is
smaller than running two containers.

### How it's laid out

```
┌──────────────────────────────────────────┐
│  lifeos container                     │
│                                      │
│  Next.js  :3000 (public)  ──────────┼──── exposed on host
│     │                                │
│     │ /_lifeos-api/* rewrite         │
│     ▼                                │
│  Hono API :8787 (127.0.0.1 only) ─── never reachable from outside
│     │                                │
│     ▼                                │
│  SQLite → /data/lifeos.db  ─────────┼──── named volume
│                                      │
└───────────────────────────────────────────┘
```

Only port 3000 is published. Browsers hit that; Next.js proxies API calls to the backend on
loopback via a rewrite. The backend is bound to `127.0.0.1` inside the container, so it is
literally unreachable from anywhere else. The bearer token gates every route on the rewrite
path except `/health`.

### Prereqs

- Docker Desktop (Mac / Windows) or Docker Engine + Compose (Linux, Raspberry Pi OS).
- ~350 MB free disk space for the image.

### Configure

```bash
cd ~/Desktop/Projects/lifeos
cp .env.example .env
```

Edit `.env`. Two variables matter for the first run:

| Variable | Purpose |
|---|---|
| `LIFEOS_TOKEN` | Shared bearer secret. **Required** whenever the port is reachable beyond localhost. Generate with `openssl rand -hex 32`. |
| `TZ` | Container timezone (e.g. `Asia/Kolkata`, `Europe/Berlin`, `America/New_York`). Controls how the backend buckets "today." Default `UTC`; set this or your daily aggregates will drift by up to 24h. |
| `VAULT_PATH` | Absolute host path to your Obsidian vault. Optional — leave unset if you don't use Obsidian sync. |

Everything else has sane defaults.

### Run

```bash
docker compose up -d --build
```

Everything on `:3000`. Data lives in a named volume `lifeos_lifeos-data` (SQLite DB persists
across `docker compose down` — use `down -v` to wipe it).

```bash
docker compose logs -f          # both processes, prefixed [backend] / [frontend]
```

Smoke test the running container:

```bash
# The 43-check suite via the same-origin rewrite
curl -fsS http://localhost:3000/_lifeos-api/health
TOKEN=$(grep LIFEOS_TOKEN .env | cut -d= -f2)
curl -o /dev/null -w "expect 401: %{http_code}\n"   http://localhost:3000/_lifeos-api/profile
curl -o /dev/null -w "expect 200: %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:3000/_lifeos-api/profile
```

### Or: pull from Docker Hub

Once the CI has published to `itsdkyp/lifeos`, you don't need to clone the repo at all:

```bash
curl -O https://raw.githubusercontent.com/itsdkyp/lifeos/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/itsdkyp/lifeos/main/.env.example
cp .env.example .env && vi .env      # set LIFEOS_TOKEN and TZ

# Swap the `build:` section for `image: itsdkyp/lifeos:latest` in docker-compose.yml.
docker compose up -d
```

Multi-arch image — same tag works on `linux/amd64` (VPS/desktop) and `linux/arm64` (Apple
Silicon / Raspberry Pi 5 / AWS Graviton).

### Ports & health

- `GET http://localhost:3000/_lifeos-api/health` — always open, returns `{ok:true}`.
- Any other API route — 401 unless `Authorization: Bearer $LIFEOS_TOKEN`.
- Container has a `HEALTHCHECK` that pings `/health` via the rewrite every 30 s. A green
  healthcheck proves BOTH processes are alive (backend AND Next.js). `docker ps` will show
  `healthy` / `unhealthy` in the STATUS column.

### Reaching the container from another device

See the **Remote access & auth** section above. In short:

- Docker publishes `${LIFEOS_PORT:-3000}` on the host, so any path that reaches the host
  (Tailscale, LAN, Cloudflare Tunnel, reverse-proxied domain) reaches the container.
- The bearer token in `.env` gates everything except `/health`.
- Browsers register the token via Settings → Security, or you bake it into the frontend at
  build time via `NEXT_PUBLIC_LIFEOS_TOKEN` in `.env` + `docker compose build`.

### Behind a reverse proxy (nginx, Caddy, Traefik)

Single upstream now — just port 3000. Example Caddy snippet, terminating HTTPS:

```caddy
lifeos.mydomain.com {
  reverse_proxy localhost:3000
}
```

### Updating

```bash
cd ~/Desktop/Projects/lifeos
git pull
docker compose up -d --build
```

Or, using the pre-built image:

```bash
docker compose pull
docker compose up -d
```

The SQLite volume is preserved. Additive migrations in `backend/src/db.ts` run automatically
on backend start.

### Backup / restore

- **Backup:** `docker compose exec lifeos cp /data/lifeos.db /data/lifeos.backup.db`,
  then copy it out with `docker cp lifeos:/data/lifeos.backup.db ./`.
- **Restore:** stop the container, put file at `/data/lifeos.db` inside the volume, start it.
- Or use the built-in **Settings → Data Management → Export / Import** UI which round-trips
  the whole SQLite file over HTTPS.

### Troubleshooting

- `error: lockfile had changes, but lockfile is frozen` — you've edited `package.json` since
  the last checked-in `bun.lock`. Run `bun install` locally first, commit `bun.lock`, then
  rebuild.
- Daily aggregates off by ~24h — you didn't set `TZ` in `.env`. The container defaults to
  UTC. Set it to your local IANA zone and `docker compose up -d --force-recreate`.
- Frontend says "Not authorized" after paste — the token in the browser and the token in the
  backend `.env` don't match. Regenerate on one side, paste on the other.
- `docker compose ps` says `no configuration file provided` — you're not in the repo root.
- Backend logs missing but frontend logs present — either the backend crashed on startup
  (`docker logs lifeos` will show `[backend] ...` prefix) or the entrypoint's health probe is
  stuck. Give it 30s; the entrypoint aborts and shows an explicit error.

---

## Switching LLM providers

Edit `llm-proxy/config.yaml` — add/remove `model_list` entries. Then in `backend/.env`:

```
DEFAULT_MODEL=copilot-sonnet   # or gpt-4o-mini, claude, gemini, groq, local, …
```

Restart the proxy + backend. Zero code changes.

---

## Obsidian sync

Any mood log / transaction / time session / journal edit rewrites:

```
<VAULT_PATH>/<JOURNAL_SUBDIR>/YYYY-MM-DD.md
```

Each file has frontmatter (`mood`, `spent`, `income`, `work_hours`) so Obsidian's Dataview / Tracker plugins can query it directly.

---

## Remote access & auth (phone, tablet, tunnels)

By default LifeOS binds to `127.0.0.1` and runs without authentication — fine for local dev.
To reach it from another device you need to (1) open the port and (2) turn on the bearer-token gate.
Everything is wired for both.

### Step 1 — generate a shared secret (once)

```bash
openssl rand -hex 32
```

Copy the 64-char hex string. You'll paste it in two places.

### Step 2 — tell the backend to accept it

Edit `backend/.env` and uncomment / fill:

```env
LIFEOS_BIND=0.0.0.0
LIFEOS_TOKEN=paste-your-64-char-hex-here
```

Restart the backend. You'll see the new bind address in the startup log. If you set
`LIFEOS_BIND=0.0.0.0` **without** a token, the backend refuses to start silently — it logs a
big warning telling you exactly why.

### Step 3 — register the token in the browser

1. Open http://localhost:3000/settings on your Mac.
2. Click the **Security** tab.
3. Paste the same 64-char token, click **Save token in this browser**.
4. The green **Authenticated** badge should appear — that's your confirmation the backend and
   browser agree.

Repeat step 3 on every device (phone, tablet, laptop) that connects. The token is stored in
`localStorage` per browser — there is nothing else to sync.

### Step 4 — pick a remote-access path

**Option A — Tailscale (recommended for personal use)**

```bash
brew install tailscale && brew services start tailscale && tailscale up
```

Install Tailscale on your phone from the App Store, sign in to the same account. From your phone
browser: `http://YOUR-MAC-NAME:3000` (MagicDNS handles the hostname). Then Settings → Security
→ paste token.

**Option B — same-Wi-Fi LAN only (no extra software)**

```bash
ipconfig getifaddr en0        # your Mac's LAN IP, e.g. 192.168.1.42
```

From your phone browser: `http://192.168.1.42:3000`. Paste token in Settings → Security.
Anyone else on the same Wi-Fi with the token can reach you — that's why the token matters.

**Option C — public HTTPS URL (Cloudflare Tunnel)**

```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

You get a `https://random-name.trycloudflare.com` URL. **The token is your only defense** —
pick a strong one, keep it in a password manager, rotate it if you ever suspect leakage.

### Step 5 — MCP clients (Claude Desktop, Cursor)

When auth is enabled, MCP tools need the token too. Add it to the `env` block:

```json
{
  "mcpServers": {
    "lifeos": {
      "command": "/Users/dileep/.bun/bin/bun",
      "args": ["run", "/Users/dileep/Desktop/Projects/lifeos/backend/src/mcp.ts"],
      "env": {
        "LIFEOS_API_URL": "http://127.0.0.1:8787",
        "LIFEOS_TOKEN": "paste-your-64-char-hex-here"
      }
    }
  }
}
```

Claude Desktop config lives at `~/Library/Application Support/Claude/claude_desktop_config.json`.
Fully quit + reopen after editing.

### What if I lose the token?

1. Edit `backend/.env`, put a fresh `openssl rand -hex 32`.
2. Restart the backend.
3. Update the token in every browser's Settings → Security and in the Claude config.

The old token is instantly invalidated the moment the backend restarts.

### What the middleware actually does

- Reads `LIFEOS_TOKEN` at startup. If unset, auth is disabled (localhost-friendly default).
- If set, every route requires `Authorization: Bearer <token>` **except** `/health` (kept open for
  load-balancer probes) and CORS `OPTIONS` preflights.
- Also accepts `?token=<hex>` as a query string for endpoints that can't set headers (e.g. the
  `/dev/export` file download opened via `window.open`).
- Rejects anything else with `401 { "error": "Unauthorized. Set Authorization: Bearer <token>." }`.

### Verifying end-to-end

```bash
cd backend && bun run smoke    # 43/43 pass, with or without a token set
```

---

## Packaging later

- **macOS `.app`**: wrap with [Tauri](https://tauri.app). Point Tauri at the Next.js static export, ship the Bun backend as a sidecar binary. One command: `bun run tauri build`.
- **Docker**: covered above.

---

## Layout

```
lifeos/
├── backend/     Bun + Hono + bun:sqlite    (:8787)
├── frontend/    Next.js 15 + Tailwind v4   (:3000)
├── llm-proxy/   LiteLLM YAML config        (:4000)
├── docker-compose.yml
└── Makefile
```

Backend has one self-check: `cd backend && bun run check`.

---

## Deliberately skipped

- Multi-user auth: shared bearer token covers the personal-use threat model. Add real user
  accounts when: multiple people share a deployment.
- Calendar month-view page: dashboard covers "today"; add when: you actually miss browsing back.
- Recurring transactions, budgets: add when: manual entry gets annoying.
- Tauri packaging: works today via `make dev` and Docker; wrap when: you want a dock icon.
