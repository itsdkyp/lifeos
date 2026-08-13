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
| `TZ` | Container timezone (e.g. `Asia/Kolkata`, `Europe/Berlin`, `America/New_York`). Controls how the backend buckets "today." Default `UTC`; set this or your daily aggregates will drift by up to 24h. |
| `VAULT_PATH` | Absolute host path to your Obsidian vault. Optional — leave unset if you don't use Obsidian sync. |

Auth is configured **inside the app**, not via env vars. On the first page load you'll be
prompted to create a username and password. No `LIFEOS_TOKEN` to generate or paste.

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

You can pin a specific release instead of `latest` by using a tag: `image: itsdkyp/lifeos:0.1.0`.

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
- Forgot your password — see **Remote access & auth → First run** above for the SQLite
  reset procedure.
- `docker compose ps` says `no configuration file provided` — you're not in the repo root.
- Backend logs missing but frontend logs present — either the backend crashed on startup
  (`docker logs lifeos` will show `[backend] ...` prefix) or the entrypoint's health probe is
  stuck. Give it 30s; the entrypoint aborts and shows an explicit error.

---

## What the LLM chat can answer

The LLM does not run arbitrary SQL. Instead, on every chat message, the backend runs a fixed
set of queries and packages them into a ~50KB JSON payload sent to the LLM. 

**What is included:**
- **Accounts:** All accounts, including `current_balance` (which reflects *all* transaction history, not just recent ones).
- **Holdings:** Your current investments (symbol, shares, cost basis). Note: live market prices are NOT sent; the LLM quotes cost-basis amounts.
- **Rolling context:** The last `N` days of transactions, mood, sleep, meals, time tracking, habit logs, and journal entries.
- **State:** Open tasks, your active timer, and your profile configuration.

**What is NOT included:**
- Transaction details older than the context window.
- Live market prices for stocks/mutual funds.

**Tuning the context window:**
In **Settings → LLM**, adjust the `context_days` slider. 
- Default (30 days) uses ~10k input tokens per turn (fraction of a cent on Gemini Flash).
- You can safely bump this to 180 days (uses ~25k tokens) — still incredibly cheap, well under any modern model's context limit, and answers historical questions much better.
- A hard payload cap (`MAX_CHARS = 90k`) ensures you can never accidentally send a multi-megabyte payload and blow out your API bill; older data is gracefully truncated if you hit the ceiling.

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

## Remote access & auth

LifeOS now uses **username + password login** as its only authentication mechanism for
browser access, and **user-generated API tokens** for programmatic access (MCP clients,
scripts, curl). There is no longer a shared `LIFEOS_TOKEN` environment variable.

### First run — create your account

On the very first page load (or first launch of a fresh Docker container), LifeOS shows a
mandatory **"Secure your LifeOS"** form. Fill in a username and password — this creates
the one account for this instance and immediately logs you in.

- **Minimum:** username 3+ chars, password 8+ chars.
- **No recovery flow:** if you forget your password, the only way back in is to SSH into
  the host and clear the credentials in SQLite:
  ```bash
  sqlite3 /data/lifeos.db "UPDATE profile SET username=NULL, password_hash=NULL WHERE id=1"
  ```
  Then reload the app — you'll see the setup form again.
- **One account only:** LifeOS is single-user. The setup endpoint permanently locks itself
  after first use (returns 403 on any further calls).

### Logging in on a new device or browser

Sessions are stored as httpOnly cookies — no token paste, no `localStorage` juggling. Just
visit the URL and enter your username + password. The session persists until you explicitly
log out (there is no automatic expiry, by design).

**Logging out:** Settings → Security → Log out. This immediately invalidates the session
server-side — reopening the tab or using the old cookie gives a 401 instantly.

### API tokens (for MCP clients, scripts, curl)

For anything that's not a browser — Claude Desktop, Cursor, a backup script, or `curl` —
you need a user-generated API token:

1. Log in with your username + password.
2. Go to **Settings → Security → API Tokens**.
3. Click **Generate**, give it a name (e.g. "Claude Desktop", "backup script").
4. Copy the token **now** — it's shown exactly once and never retrievable again (only its
   SHA-256 hash is stored in the database).
5. Use it as a Bearer header: `Authorization: Bearer <token>`.

Tokens can be revoked individually from the same Settings page at any time. A revoked token
stops working immediately — no restart required.

**Privilege restriction:** API tokens can call any regular endpoint (accounts, finance, LLM
chat, etc.) but cannot manage tokens themselves (`GET/POST/DELETE /api-tokens`) or change
your password. Those operations require a logged-in browser session. This means a leaked
MCP token cannot mint itself more tokens or change the password.

### MCP clients (Claude Desktop, Cursor)

Generate an API token (above), then add it to your MCP client config:

```json
{
  "mcpServers": {
    "lifeos": {
      "command": "/Users/dileep/.bun/bin/bun",
      "args": ["run", "/Users/dileep/Desktop/Projects/lifeos/backend/src/mcp.ts"],
      "env": {
        "LIFEOS_API_URL": "http://127.0.0.1:8787",
        "LIFEOS_API_TOKEN": "your-generated-token-here"
      }
    }
  }
}
```

Note: the env key is `LIFEOS_API_TOKEN` (not `LIFEOS_TOKEN` — that no longer exists).
Claude Desktop config lives at `~/Library/Application Support/Claude/claude_desktop_config.json`.
Fully quit + reopen after editing.

### Exposing LifeOS to the internet (Cloudflare Tunnel)

The recommended path for public internet access is a **named Cloudflare Tunnel** — it
requires no static IP, no router port-forwarding, and works behind CGNAT. Your LifeOS
password is what protects the app; no separate `LIFEOS_TOKEN` env var is needed.

```bash
# on your always-on machine (e.g. the Pi)
sudo apt install cloudflared
cloudflared tunnel login                              # opens a browser URL to authorise
cloudflared tunnel create lifeos
cloudflared tunnel route dns lifeos lifeos.yourdomain.com

# create /etc/cloudflared/config.yml
tunnel: lifeos
credentials-file: /home/you/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: lifeos.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404

sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

After that, `https://lifeos.yourdomain.com` reaches your LifeOS login page. Your username
and password are the only gate — protect them like any online account.

**Reboot survival:** Docker (`restart: unless-stopped`) and the `cloudflared` systemd
service both auto-start. Verify with:
```bash
sudo systemctl is-enabled docker cloudflared   # both should say "enabled"
sudo reboot                                    # then check both are running 60s later
```

**Cookie security note:** LifeOS automatically marks the session cookie `Secure` when
requests arrive via HTTPS (detected from Cloudflare's `X-Forwarded-Proto` header). Over
plain HTTP (LAN, localhost) the cookie is sent unencrypted — fine on a trusted network,
reasonable risk. Behind the Cloudflare Tunnel, TLS is always enforced.

### Rate limiting

The login endpoint enforces a basic rate limit: **10 failed attempts within 15 minutes**
trigger a temporary lockout (`429 Too Many Requests`). This is the primary defence against
brute-force attacks when LifeOS is internet-facing. The counter resets automatically after
the window expires.

### Smoke testing with auth enabled

```bash
# Against a fresh / unconfigured instance (e.g. CI):
cd backend && bun run smoke
# The runner self-registers a throwaway account and runs all 46 checks.

# Against your own already-configured instance:
# 1. Generate a token in Settings -> Security -> API Tokens.
# 2. LIFEOS_API_TOKEN=<token> bun run smoke
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

- Multi-user auth: single username+password covers the personal-use threat model. Add real
  user accounts (with row-level isolation) when multiple people share a deployment.
- Calendar month-view page: dashboard covers "today"; add when: you actually miss browsing back.
- Recurring transactions, budgets: add when: manual entry gets annoying.
- Tauri packaging: works today via `make dev` and Docker; wrap when: you want a dock icon.
- Token expiry: sessions and API tokens are both valid until explicitly revoked or logged out.
  Add expiry (e.g. 90-day rolling TTL) when: you expose LifeOS to a broader audience where
  long-lived sessions become a meaningful risk.
