# LifeOS

Personal life tracker: journal, finance, mood, time, pomodoro, LLM chat over your own data.
Syncs everything to your Obsidian vault as daily markdown files.

**Stack:** Bun + Hono + SQLite backend · Next.js 15 + Tailwind v4 + shadcn/ui frontend · LiteLLM proxy for any LLM (GitHub Copilot, OpenAI, Anthropic, Gemini, Groq, Ollama…).

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

```bash
docker compose up --build
```

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

## Packaging later

- **macOS `.app`**: wrap with [Tauri](https://tauri.app). Point Tauri at the Next.js static export, ship the Bun backend as a sidecar binary. One command: `bun run tauri build`.
- **Docker**: `docker-compose.yml` already there.

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

- Auth: single-user, local. Add when: exposing to the internet.
- Calendar month-view page: dashboard covers "today"; add when: you actually miss browsing back.
- Recurring transactions, budgets: add when: manual entry gets annoying.
- Tauri packaging: works today via `make dev` and Docker; wrap when: you want a dock icon.
