# LifeOS — Progress & Roadmap

_Last updated: 2026-07-28._

A single-user, self-hosted personal-life tracker + AI analytics assistant.
Runs locally (Bun backend + Next.js frontend + SQLite) or in Docker.
All data is written to markdown files inside your Obsidian vault for a
plain-text backup.

---

## 1. Architecture

```
┌─── frontend (Next.js 15, port 3000) ──────────┐
│  React 19 · Tailwind v4 · shadcn tokens       │
│  Recharts · react-markdown · react-masonry-css│
└──────────────────────┬────────────────────────┘
                       │  JSON over fetch
┌──────────────────────┴────────────────────────┐
│  backend (Bun + Hono, port 8787)              │
│  bun:sqlite · zod validation                  │
│                                               │
│  Provider dispatchers:                        │
│   • Yahoo Finance (stocks/ETF/crypto prices)  │
│   • AMFI (daily Indian MF NAVs)               │
│   • open.er-api.com (FX rates)                │
│   • LLM (in-app config: 10 providers +        │
│     GitHub Copilot OAuth + Anthropic OAuth)   │
└──────────────────────┬────────────────────────┘
                       │  filesystem
              Obsidian vault (markdown/day)
```

Ports:
- `3000` frontend
- `8787` backend
- `4000` LiteLLM proxy (optional — only for Copilot fallback path)
- `53692` transient — Anthropic OAuth callback listener

DB path: `backend/lifeos.db`
Vault path: from `VAULT_PATH` env → written as `<vault>/<JOURNAL_SUBDIR>/YYYY-MM-DD.md`

---

## 2. What's built

### 2.1 Core life-tracking modules

| Module | Backend routes | Frontend page | Obsidian section |
|---|---|---|---|
| **Journal** | `GET/POST /journal/:day` | `/journal` | `## Journal` |
| **Tasks** | `GET /tasks` · `POST /tasks` · `PATCH /tasks/:id` · `DELETE /tasks/:id` | `/tasks` | `## Tasks` |
| **Habits** | `GET/POST/DELETE /habits` · log/unlog · `/habits/grid` | `/habits` | `## Habits` |
| **Mood** (1D + 2D) | `POST /mood` · `POST /mood2d` | dashboard + ⌘K | `## Mood` |
| **Sleep** | `GET/POST /sleep/:day` · `GET /sleep` | dashboard + `/health` | `## Sleep` |
| **Weight** | `GET/POST/DELETE /weight` | `/weight` · `/health` | `## Weight` |
| **Meals / calories** | `GET/POST /meals` · `/meals/daily` | `/meals` · `/health` | `## Meals` |
| **Finance** | `GET/POST /finance` · `DELETE /finance/:id` · `POST /finance/import` | `/finance` · `/money` | `## Finance` |
| **Time sessions** | `POST /time/start`, `/time/stop` · `GET /time`, `/time/active` | `/time` · `/focus` | `## Time` |
| **Pomodoro** | client-only | `/focus` + dashboard card | – |
| **Wins + gratitude** | `GET/POST/DELETE /wins`, `/gratitudes` | `/journal` + dashboard | `## Wins` · `## Gratitude` |
| **Profile** | `GET/PUT /profile` | onboarding modal + `/settings` | drives frontmatter + personalization |

### 2.2 Investments

Structured across four data tiers:

1. **Holdings table** — one row per (symbol × broker/folio).
   Columns: symbol, kind (`stock`/`etf`/`crypto`/`mf`/`debt`), shares,
   cost_basis, currency, note, manual_price, imported_from,
   monthly_contribution, contribution_last_applied, created_at.
2. **Live prices** — Yahoo Finance v8 chart API for stocks/ETFs/crypto;
   AMFI `NAVAll.txt` for Indian MFs; falls back to `manual_price` when
   nothing live is available.
3. **FX conversion** — `open.er-api.com`, cached 1h, applied when
   computing the grand total in profile currency.
4. **Deterministic allocation gauge** — computed by backend, rendered
   as a visual (not markdown).

Import adapters:

- Groww **Stocks Holdings** `.xlsx`
- Groww **Mutual Funds** `.xlsx`
- Ind Money **US Holdings** `.xls` (skips "USD" cash line)
- Ind Money **US Orders** `.xls` (aggregates BUY/SELL → net positions with weighted-avg cost)

Auto-resolve names → Yahoo tickers via `/holdings/resolve` (uses Yahoo search).

Buckets on `/invest`:
- Indian stocks & ETFs
- US stocks & ETFs
- Mutual funds (excl. retirement)
- **Retirement (EPF/PPF/NPS)** — own bucket + own gauge row
- Debt / Fixed income
- Crypto

Consolidation-on-import: manual entries with the same symbol prefix as an
imported one are deleted, their SIP settings transferred to the imported
row. No more silent duplicates.

Recurring contributions (SIP + EPF/PPF):
- `monthly_contribution` + `contribution_last_applied` per holding.
- Applied lazily on every `GET /holdings` — catches up missed months.
- Balance-style (EPF, shares=1): bumps `cost_basis` and `manual_price`.
- SIP-style (real MF units): buys units at current NAV, weighted-averages cost basis.

Symbol autocomplete: presets (EPF/PPF/NPS/FD/RD/SSY/KVP/NSC/SCSS/SGB/POMIS/VPF) + Yahoo search + AMFI MF search — all via `/holdings/search?q=…`.

### 2.3 AI advisor + insights

Backend endpoints:
- `POST /chat` — 14-day context + regex intent parser (short-circuits log verbs to DB writes)
- `POST /holdings/advice` — Indian-financial-expert system prompt, returns markdown narrative
- `POST /holdings/advisor` — follow-up chat, keeps conversation context
- `GET /holdings/allocation` — deterministic gauge data (not LLM)
- `GET /review/week` — LLM-generated weekly review over 7 days of data

Intent parser (in `/chat`) covers:

```
mood 8 6 focused
spent 200 on food
weight 71.8
sleep 23:30 07:15 8
meal chicken bowl 650
worked on Vitex for 30 minutes
went for a walk for 15 minutes, and drank coffee for ₹20
I bought groceries          (fuzzy-closes matching open task)
I need to call mom tomorrow (creates task with due date)
create a habit of meditation
start deep work · stop
grateful morning coffee
win shipped LifeOS
buy AAPL 3 150
```

Multi-clause processing splits on `and` and `;` so a single message can log multiple things.

### 2.4 LLM integration

In-app config at Settings → LLM:

- 10 providers via direct dispatch (OpenAI, Anthropic, Gemini, Groq, Mistral, DeepSeek, OpenRouter, Ollama, GitHub Copilot, Custom)
- **GitHub Copilot subscription** via OAuth device flow (from pi's implementation, verified against GitHub's endpoints)
- **Anthropic Claude Pro/Max** via OAuth PKCE + local callback on `127.0.0.1:53692` with manual-paste fallback
- Test-connection button
- Cached advice (6h) with force-regenerate

### 2.5 UI/UX

Shell:
- Sidebar sections (Home/Journal/Tasks/Habits · Time · Money · Health · Review/Chat/Settings)
- Clickable section headers → each section has a dedicated overview page
- Mobile: horizontal scrollable bottom nav, floating `+` FAB, all 13 pages accessible
- **Red pulse dot** on Time nav when a session is active
- Theme toggle (sun/moon icon) next to LifeOS title
- Dark + Light + System modes, persisted to localStorage

Home dashboard:
- Greeting + **live counter** (days/hours/min/sec/µs since DOB)
- Active session banner (compact, ticking, one-click stop)
- Today stats (mood, sleep, deep work, tasks, spend, wins, gratitude, calories, weight)
- Nudge card (context-aware)
- Range toggle (7d/30d/90d/1y) drives Trend section only
- Sparklines for mood, sleep, weight, hours, calories, spend, category pie
- Chat widget button

⌘K palette:
- Same intent parser as chat
- Suggestions grid
- Escape/click-out to close
- Ctrl+K keybind (with meta on macOS)

Investments page (fullest example):
- Grand strip: total value | cost basis | P&L (responsive)
- Two-row chart layout (Allocation donut · P&L bars per bucket)
- Masonry buckets (react-masonry-css) — each card scrolls internally
- Financial advisor with:
  - **Deterministic allocation gauge** (backend-computed, real bars with target ranges)
  - LLM narrative (Snapshot / What's working / What to fix / This month / Note)
  - Interactive follow-up chat with quick-start chips
  - Markdown rendered (react-markdown + remark-gfm)
- Import button (single file drop for any supported broker file)
- Auto-resolve-tickers button
- Symbol autocomplete on Add form

### 2.6 Cross-cutting

- **Obsidian sync**: every write to journal / mood / txn / session / task / weight / meal / sleep / win / gratitude / habit rewrites `<vault>/<subdir>/YYYY-MM-DD.md` with a frontmatter block for Dataview/Tracker/Charts plugins.
- **Local-time SQL**: all timestamp queries use `date(ts, 'localtime')` so log entries appear on the correct calendar day for the user's timezone.
- **PWA manifest**: installable on iOS/Android.
- **Onboarding modal**: appears on first launch when profile is empty.
- **Selfcheck**: `bun run check` in `backend/` runs a smoke test that seeds a day, syncs to Obsidian, and asserts frontmatter fields.

### 2.7 Pi (host agent) additions

Independent of LifeOS, we added to `~/.pi/agent/extensions/`:

- `/mode yolo` — 4th agent mode, sets `PI_YOLO=1` env var so `safety-guard` skips prompts. Sidebar shows red 🔥 badge.
- `safety-guard` reads `process.env.PI_YOLO` live per call — no reload needed.

---

## 3. Provider integrations & credentials

| Provider | Purpose | Auth | Where configured |
|---|---|---|---|
| Yahoo Finance | Stock/ETF/crypto quotes + search | none | direct fetch |
| AMFI | Indian MF NAVs (daily) | none | direct fetch |
| open.er-api.com | FX rates | none | direct fetch |
| GitHub Copilot | LLM (subscription) | OAuth device flow | Settings → LLM → Sign in |
| Anthropic (Claude Pro/Max) | LLM (subscription) | OAuth PKCE + callback | Settings → LLM → Sign in |
| OpenAI/Anthropic/Gemini/Groq/… | LLM (API key) | API key | Settings → LLM |
| Ollama | LLM (local) | none | Settings → LLM |
| LiteLLM proxy | LLM multi-provider | env vars / OAuth | optional sidecar, `make proxy` |

Tokens live in `backend/lifeos.db` (unencrypted, single-user local).

---

## 4. Known issues / rough edges

1. **Interest doesn't accrue for EPF/PPF** — only monthly contributions bump balance. User must manually update ~annually when EPFO credits interest.
2. **Cost basis is weighted-average** — not FIFO. Fine for tracking, not tax-file quality.
3. **No historical portfolio snapshots** — can't render a portfolio-value line chart over time.
4. **AMFI matching is fuzzy** — for MF names not exactly in AMFI's catalog, falls back to `manual_price`.
5. **Yahoo v7 quote API is 401 now** — using v8 chart endpoint per-symbol; a bit slower but works.
6. **`/holdings` runs migrations, FX fetch, AMFI fetch, Yahoo fetch, and NAV apply on every call** — first call after boot is slow (~2s). Cached after that.
7. **DOB in profile can be a future date** — no validation; broke advisor allocation math earlier (age=0). Not fixed.
8. **Groww's Direct/Regular variants** — matching by name works but breaks if scheme names change.
9. **No streaming LLM output** — advice waits ~3–5s for full response.
10. **Command palette parser is regex-based** — misses creative phrasings (would need LLM intent parser).
11. **No editing UI for existing holdings** — can only delete + re-add or PATCH via curl.
12. **Money bucket allocation includes only holdings** — cash / bank balance not tracked.

---

## 5. Next steps (priority ranked)

### P0 — high-signal, low-cost

1. **Inline SIP edit on bucket rows** — small `+` icon on each row → prompt for `monthly_contribution`. PATCH endpoint already exists.
2. **Age validation on profile save** — reject DOB in future, reject age > 120.
3. **Fix Groww category import** — capture `Category` and `Sub-category` columns → sub-classify Indian equity as large/mid/small cap in the gauge.
4. **Editable holdings** — inline row edit (symbol / kind / cost / manual price).
5. **Streaming LLM responses** — advisor + chat use `stream: true`, render token-by-token.
6. **Correlations tab on `/insights`** — Pearson between sleep×mood, spend×mood, hours×mood. Client-side, ~50 lines.

### P1 — meaningful features

7. **Historical portfolio snapshots** — cron writes daily total to `portfolio_snapshots`, renders 30/90/1y line chart on `/invest`.
8. **Journal month calendar** — GitHub-style contribution grid; click a date to jump.
9. **Bank CSV auto-detect** — presets for HDFC / ICICI / SBI / Axis / Kotak column layouts.
10. **Recurring transactions** — mark txn recurring; auto-project monthly totals.
11. **Budget per category** — spending cap with progress ring on `/money`.
12. **Steps + exercise** — manual daily log, optional CSV import from Google Fit / Apple Health.
13. **Water intake** — one-tap counter.
14. **Nutrition targets** — daily protein/fat/carb goals with progress rings on `/meals`.
15. **Task ↔ time** — completing a task can auto-log a session (optional per-task).
16. **Weekly review calls out correlations** — feed insight tab's numbers into the LLM prompt.

### P2 — nice-to-haves

17. **Goals hierarchy** — quarterly → monthly → tasks with progress rollup.
18. **Meds / supplements** — habit variant with dose + time-of-day.
19. **Barcode scan for meals** — Open Food Facts API.
20. **Zerodha / Kotak / Axis Direct MF importers** — same pattern as Groww.
21. **NPS PRAN statement import**.
22. **PDF/CSV export** — full backup + tax-ready P&L.
23. **Web-push notifications** — evening mood/sleep prompt, weekly review reminder.
24. **Skeleton loaders** — replace "Loading…" with layout-stable skeletons.
25. **Command palette LLM parser** — replace the regex fallback for creative phrases.
26. **Values / life-audit screen** — quarterly ritual, LLM-driven Socratic prompts.

### P3 — packaging & distribution

27. **Tauri macOS app** — wrap Next.js + Bun sidecar as `.app`.
28. **PWA install banner** — first-time prompt on iOS/Android.
29. **Multi-user support** — user_id column on every table + simple email/password.
30. **Encryption at rest** — API keys, LLM tokens, health data. Requires opinionated master key handling.

### P4 — long tail

31. LLM tool-calling for actions (currently server-side regex parser)
32. Real FIFO cost basis for tax reporting
33. Body composition / BP / glucose tracking
34. Historical NAV for MFs (retro cost-basis correction)
35. Rebalancing simulator ("if I move ₹50k from equity to debt, what would the gauge look like?")
36. Portfolio scenario planner
37. AI-generated monthly SIP recommendations (currently narrative-only)

---

## 6. Development

```bash
# Once
cd ~/Desktop/Projects/lifeos
make install                     # bun install in backend/ + frontend/

# Every session (three terminals)
make backend                     # bun --hot src/index.ts  → :8787
make frontend                    # next dev               → :3000
make proxy                       # LiteLLM (optional)     → :4000

# Smoke test
cd backend && bun run check
```

Env vars in `backend/.env`:
```
PORT=8787
DB_PATH=./lifeos.db
VAULT_PATH=/Users/dileep/Documents/Obsedian/dilleep-personal/Dileep-Personal
JOURNAL_SUBDIR=Journal
LLM_PROXY_URL=http://127.0.0.1:4000       # only for LiteLLM fallback
DEFAULT_MODEL=copilot-sonnet
```

Docker:
```bash
docker compose up --build         # everything on :3000/:8787/:4000
```

---

## 7. File map

```
lifeos/
├── backend/
│   ├── src/
│   │   ├── index.ts          Hono routes (~1600 lines)
│   │   ├── db.ts             SQLite schema + migrations
│   │   ├── llm.ts            10-provider dispatcher
│   │   ├── oauth.ts          Copilot device flow + Anthropic PKCE
│   │   ├── importers.ts      Groww + Ind Money adapters
│   │   ├── obsidian.ts       Daily-note writer
│   │   └── selfcheck.ts      Smoke test
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx          Home dashboard
│   │   ├── invest/           Portfolio dashboard + advisor
│   │   ├── money/            Cashflow overview
│   │   ├── health/           Sleep/weight/meal overview
│   │   ├── journal/, tasks/, habits/, meals/, weight/,
│   │   ├── time/, focus/, review/, chat/, settings/
│   │   └── layout.tsx        Root (theme + profile providers)
│   ├── components/
│   │   ├── shell.tsx                     Sidebar + bottom nav + theme
│   │   ├── command-palette.tsx           ⌘K omni-log
│   │   ├── chat-widget.tsx               Dashboard chat button
│   │   ├── active-session.tsx            Red-pulse timer banner
│   │   ├── lived-counter.tsx             Live µs counter
│   │   ├── allocation-gauge.tsx          Deterministic gauge
│   │   ├── investment-advice.tsx         AI advisor + gauge + chat
│   │   ├── symbol-autocomplete.tsx       Yahoo + AMFI + presets
│   │   ├── llm-settings.tsx              Provider config + OAuth buttons
│   │   ├── oauth-modals.tsx              Copilot + Anthropic sign-in
│   │   ├── onboarding.tsx                First-launch profile modal
│   │   └── card.tsx, stat-card.tsx, quick-*.tsx, task-list.tsx, …
│   ├── lib/
│   │   ├── api.ts            typed fetch client
│   │   ├── profile.tsx       useProfile hook + currency helpers
│   │   ├── theme.tsx         useTheme hook
│   │   └── utils.ts          cn()
│   └── public/manifest.json, icon.svg
├── llm-proxy/config.yaml     LiteLLM (optional)
├── docker-compose.yml
├── Makefile
└── docs/PROGRESS.md          this file
```

---

## 8. Design principles

Reproduced here so any future rewrite doesn't drift:

- **Home = read-only.** All inputs live in `⌘K` or dedicated pages.
- **One input surface first.** ⌘K > forms.
- **Everything writes to Obsidian.** The DB is the fast index; markdown is the durable truth.
- **Deterministic where possible, LLM where necessary.** Gauge is math; advice is prose.
- **No fake features.** Bank sync would be fake without Plaid/AA — we import CSVs instead.
- **Sensible defaults, never opinions on data.** Currency, timezone, sleep target come from profile; app doesn't lecture.
- **Compassionate framing.** Streaks as consistency %, not "you broke it." No red alerts on mood dips.
