# LifeOS — Session Handoff

_Written 2026-07-28 at end of a long build session. A fresh agent should read
`docs/PROGRESS.md` first (full status), then this file (recent context)._

---

## What LifeOS is (one paragraph)

Self-hosted personal life tracker + AI analytics for a single user (Dileep).
Bun + Hono + SQLite backend, Next.js 15 frontend, writes every entry to an
Obsidian vault as markdown. Modules: journal, tasks, habits, mood, sleep,
weight, meals, finance (with CSV/xlsx broker imports), time sessions,
pomodoro, wins/gratitude, investments (Groww + Ind Money import, live Yahoo +
AMFI prices, FX conversion, deterministic allocation gauge + LLM advisor),
LLM integration (10 providers, GitHub Copilot OAuth, Anthropic OAuth),
profile with configurable vault path.

---

## Repository

- **Path**: `~/Desktop/Projects/lifeos/`
- **Git**: initialized, branch `main`, no remote yet, ~5 commits.
- **Not pushed anywhere.**
- Detailed doc: `docs/PROGRESS.md` (389 lines — full inventory + roadmap).
- Handoff (this file): `docs/HANDOFF.md`

Commit history (most recent first):

```
Home page: capitalize greeting + name; remove `age N` from header
Home clock: force uppercase AM/PM, fix hydration mismatch, prompt for DOB
Home page: 12h clock, inline active-session pill, drop hours from lived counter
Vault path + journal subfolder configurable from Settings
Remove stray backup file, ignore .bak*
Initial commit: LifeOS with backend, frontend, Docker, and progress doc
```

---

## Runtime — what's running (host machine)

Two long-running dev processes (started by earlier turns, not systemd):

- **Backend**: `bun run src/index.ts` in `backend/` → `127.0.0.1:8787`
- **Frontend**: `next dev` in `frontend/` → `127.0.0.1:3000`

Logs are in `logs/backend.log` and `logs/frontend.log`.

Restart pattern used throughout:

```bash
export PATH="$HOME/.bun/bin:$PATH"
pkill -f "src/index.ts" 2>/dev/null; sleep 0.5
cd ~/Desktop/Projects/lifeos/backend
nohup bun run src/index.ts > ../logs/backend.log 2>&1 &
disown
```

Docker is set up (Dockerfiles + docker-compose.yml with persistent volumes)
but never actually built and run — dev is entirely host-native so far.

---

## Data state

- **DB**: `backend/lifeos.db` (SQLite, WAL mode).
- Contains real user data: profile, 19 imported holdings from Groww (10 MFs +
  9 stocks) plus 2 from Ind Money (TQQQ, USD/ProShares Ultra Semiconductors),
  seeded 60-day demo data for other trackers, some real journal/mood/task
  entries from user testing.
- **Vault**: `/Users/dileep/Documents/Obsedian/dilleep-personal/Dileep-Personal/Journal/`
  contains many `YYYY-MM-DD.md` files with frontmatter.
- Profile.dob was `2026-07-09` (future — advisor complained). User was
  supposed to correct this in Settings but I don't know if they did.

---

## LLM configuration

User is signed in to **GitHub Copilot via in-app OAuth** (from Settings → LLM
→ Sign in with GitHub). Default model: `claude-sonnet-4.5` via Copilot.
Tokens live in `oauth_tokens` table in the DB, auto-refreshing.

The `/chat`, `/holdings/advice`, `/holdings/advisor`, and `/review/week`
endpoints all call this LLM.

---

## What was just being worked on (last ~30 turns)

Chronological summary — most recent last:

1. **`/invest` page polish** — masonry buckets, allocation gauge, financial
   advisor with interactive chat, gauge cards + LLM narrative.
2. **Recurring SIP / EPF monthly contributions** — new `monthly_contribution`
   and `contribution_last_applied` columns on `holdings`; applied lazily on
   every `GET /holdings`; balance-style (EPF) bumps `cost_basis` + `manual_price`,
   SIP-style (MFs) buys units at current NAV and re-weighted-averages cost.
3. **Import consolidation** — on `POST /holdings/import`, manual entries
   whose symbol prefix-matches an imported holding get deleted and their SIP
   settings transferred. No more silent duplicates.
4. **Symbol autocomplete** — presets (EPF/PPF/NPS/…) + Yahoo search + AMFI
   fuzzy search in one `/holdings/search` endpoint. `SymbolAutocomplete`
   component; auto-fills kind + currency on pick.
5. **Retirement bucket** — EPF/PPF/NPS get their own category, own gauge row
   with 10–20% target range, distinct from generic Debt.
6. **Vault path from Settings** — `profile.vault_path` +
   `profile.journal_subdir` columns; `syncDay()` reads from DB, falls back to
   env vars.
7. **Docker + git** — Dockerfiles for backend/frontend, docker-compose with
   named `lifeos-data` volume + bind-mounted vault. Git initialized on `main`.
8. **PROGRESS.md** written — 8-section 389-line status doc.
9. **Home page tweaks** — active-session pill next to greeting, live clock
   with uppercase AM/PM (fixed en-IN locale + SSR hydration), lived counter
   drops the hours field, greeting capitalized, `age N` removed from header.

---

## Uncommitted / in-flight (nothing lost, but review)

The tree is clean at the time of writing. `git status` should show no
changes. If any stray edits show up, they'd be from testing the pi compaction
patch (outside the repo).

---

## Known bugs / rough edges the user hit but we didn't fully finish

1. **Empty vertical space in `/invest` bucket masonry** — user complained
   several times about gaps. Current workaround: capped bucket-list height to
   `max-h-[22rem]` with internal scroll, limited masonry to 2 columns. Still
   not perfect but the user moved on to other topics.
2. **Profile DOB** was in the future (`2026-07-09`). Advisor prompt now says
   "USE it", but nothing validates future dates on save. Add validation.
3. **Investment advisor prompt** now emits real markdown headings and
   references the deterministic gauge instead of a self-rendered table. The
   markdown renders via `react-markdown + remark-gfm`.
4. **AMFI matching** truncated MF symbols on import broke matching earlier
   (fixed by not truncating scheme names).
5. **Interest doesn't accrue** for EPF/PPF — only contributions bump.
6. **No editing UI** for existing holdings (can only delete + re-add). PATCH
   endpoint exists (`PATCH /holdings/:id` accepts `monthly_contribution`);
   frontend button missing.

---

## Immediate next tasks (from PROGRESS.md P0)

The user paused when I was about to build these. Pick these up when they say
so, or if they say "continue LifeOS":

1. **Inline SIP edit button** on `/invest` bucket rows — small icon → prompt
   → PATCH `/holdings/:id`. Backend endpoint already exists.
2. **Age validation** on `PUT /profile` — reject `dob > today`, reject `age > 120`.
3. **Groww category import** — capture `Category` + `Sub-category` from the
   MF `.xlsx` so the gauge can sub-classify Indian equity into large/mid/small cap.
4. **Editable holdings** — inline symbol/kind/cost edit on bucket rows.
5. **Streaming LLM responses** — advice + chat use `stream: true` and render
   token-by-token.
6. **`/insights` correlations tab** — sleep×mood, spend×mood Pearson
   coefficients client-side.

Below P0 there's a long P1–P4 list in `docs/PROGRESS.md`.

---

## Key file map

Only the parts you'll actually touch. Full list in `docs/PROGRESS.md § 7`.

```
backend/src/
  index.ts             # Hono routes (~1600 lines) — every endpoint here
  db.ts                # SQLite schema + additive migrations at boot
  llm.ts               # Provider dispatcher (10 providers)
  oauth.ts             # Copilot device flow + Anthropic PKCE
  importers.ts         # Groww Stocks/MF + Ind Money Holdings/Orders adapters
  obsidian.ts          # syncDay() — reads vault path from profile
frontend/
  app/page.tsx                          # Home dashboard
  app/invest/page.tsx                   # The big one — buckets, gauge, advisor
  app/settings/page.tsx                 # Profile + LLM + vault + demo data
  components/allocation-gauge.tsx       # Deterministic gauge (backend data)
  components/investment-advice.tsx      # Gauge + LLM narrative + chat
  components/symbol-autocomplete.tsx    # Presets + Yahoo + AMFI dropdown
  components/oauth-modals.tsx           # Copilot + Anthropic sign-in
  components/shell.tsx                  # Sidebar + bottom-nav + theme
  lib/api.ts                            # Typed fetch client
  lib/profile.tsx                       # useProfile hook + currency helpers
```

---

## How to resume

New agent, first turn should:

1. `cd ~/Desktop/Projects/lifeos && git status` (should be clean)
2. Read `docs/PROGRESS.md` for full inventory
3. Read this file for recent context
4. Confirm backend + frontend still running:
   ```
   lsof -iTCP:8787 -sTCP:LISTEN -n -P
   lsof -iTCP:3000 -sTCP:LISTEN -n -P
   ```
5. If not running, restart per the pattern in § "Runtime" above.
6. Ask the user which P0 to pick up, or wait for their instruction.

---

## Design principles the app follows (re-stated so a new agent doesn't break them)

- **Home = read-only**. All inputs go through `⌘K` palette or dedicated pages.
- **One input surface first**. `⌘K` (or the `+` FAB on mobile) can log anything.
- **Everything writes to Obsidian**. DB is the fast index; markdown is durable truth.
- **Deterministic where possible, LLM where necessary**. Gauge is math; advice is prose.
- **No fake features**. Bank sync isn't feasible for personal use → CSV import instead.
- **Never lecture the user about their data**. Streaks as consistency %, not "you broke it."
- **Ponytail defaults** — the app uses YAGNI/stdlib/native aggressively; keep it that way.

---

## User voice / preferences (learned)

- Prefers **speed over perfection**. Ships fast, iterates on feedback.
- **Voice-transcribed messages** are common (typos, "uodate" for "update").
  Parser is intentionally forgiving.
- Uses **GitHub Copilot Enterprise** (that's why the compaction bug hits).
- **India-based** — INR, Asia/Kolkata, Groww + Ind Money brokers, EPF.
- Cares about **UI polish** — flagged gauge gaps, mobile layout, AM/PM case, etc.
- Wants **investment features** to keep growing (advisor, SIPs, retirement, US
  stocks).

---

## What to do if the LLM refuses / errors

If the advisor or chat starts erroring after this session:

1. Check `Settings → LLM`. Confirm provider is still `github_copilot` with
   `auth_type: oauth` and green "Signed in" badge.
2. If red, click **Sign in** → complete OAuth device flow again.
3. If still failing, temporarily switch to a different provider (Groq is
   free, Ollama is local). Then switch back later.
4. Yahoo/AMFI/FX outages are silent — holdings still render with fallback
   prices (report/cost). Retry with the Refresh button.

---

_End of handoff. Any agent picking this up: start by reading
`docs/PROGRESS.md`. This file is the "what just happened"; that one is the
"where we are"._
