// API base URL selection:
//   1. NEXT_PUBLIC_API_URL (dev / build-time override) — explicit absolute origin.
//   2. Otherwise, use same-origin + /_lifeos-api rewrite path (single-container setup).
// The rewrite is defined in next.config.ts and forwards to the Hono backend on
// 127.0.0.1:8787 inside the same container. In dev with two separate processes,
// set NEXT_PUBLIC_API_URL to the explicit http://127.0.0.1:8787 and the rewrite
// simply doesn't get exercised.
const API_PREFIX = "/_lifeos-api";
const envApiUrl = process.env.NEXT_PUBLIC_API_URL;
let API = envApiUrl && envApiUrl.length > 0 ? envApiUrl : API_PREFIX;

if (typeof window !== "undefined" && (!envApiUrl || envApiUrl.length === 0)) {
  // Same-origin: window.location.origin + /_lifeos-api. Works from any host,
  // any port, over HTTP or HTTPS — no per-device config needed.
  API = `${window.location.origin}${API_PREFIX}`;
}

// Auth is cookie-based now (session set by POST /auth/login, httpOnly). Since every
// request is same-origin (the /_lifeos-api rewrite), the browser attaches that cookie
// automatically on every fetch() — that's the Fetch API's default `credentials:
// "same-origin"` behavior, nothing to configure here. API-token bearer auth (for
// MCP/scripts) is handled entirely server-side; the browser never touches that value.

// Registered by AuthProvider (lib/auth.tsx) so that ANY 401 from ANY API call — not
// just the initial page load — immediately flips the app back to the login gate,
// e.g. if a session is invalidated elsewhere while a tab is still open.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) { onUnauthorized = fn; }

// Public helper for streaming/multipart/download calls that can't go through req().
export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, init);
}

export function apiBase(): string { return API; }

// Thrown by req() on any non-2xx response. Carries the HTTP status so callers can
// tell "not authorized" (401 — session expired/missing) apart from "not found"/
// "bad request"/other real errors, instead of lumping every failure into a generic catch.
export class ApiError extends Error {
  status: number;
  constructor(status: number, body: string) {
    super(`${status} ${body}`);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  if (!r.ok) {
    if (r.status === 401) onUnauthorized?.();
    throw new ApiError(r.status, await r.text());
  }
  return r.json() as Promise<T>;
}

export const api = {
  // App's own login (password auth). Named "session*" to stay distinct from the
  // pre-existing authStatus/authLogout below, which are about third-party OAuth
  // provider connections (Google/Copilot/Anthropic), a different concept entirely.
  sessionStatus: () => req<{ configured: boolean; authenticated: boolean }>(`/session/status`),
  sessionSetup: (username: string, password: string) =>
    req(`/session/setup`, { method: "POST", body: JSON.stringify({ username, password }) }),
  sessionLogin: (username: string, password: string) =>
    req(`/session/login`, { method: "POST", body: JSON.stringify({ username, password }) }),
  sessionLogout: () => req(`/session/logout`, { method: "POST" }),
  sessionChangePassword: (current_password: string, new_password: string) =>
    req(`/session/change-password`, { method: "POST", body: JSON.stringify({ current_password, new_password }) }),
  apiTokens: () => req<{ id: number; name: string; created_at: string; last_used_at: string | null }[]>(`/api-tokens`),
  apiTokenCreate: (name: string) => req<{ token: string; name: string }>(`/api-tokens`, { method: "POST", body: JSON.stringify({ name }) }),
  apiTokenDelete: (id: number) => req(`/api-tokens/${id}`, { method: "DELETE" }),

  summary: (days = 7) => req<Summary>(`/summary?days=${days}`),
  journalGet: (day: string) => req<{ day: string; content: string }>(`/journal/${day}`),
  journalSave: (day: string, content: string) =>
    req(`/journal/${day}`, { method: "POST", body: JSON.stringify({ content }) }),
  logMood: (score: number, note = "") =>
    req(`/mood`, { method: "POST", body: JSON.stringify({ score, note }) }),
  addTxn: (t: { amount: number; category: string; note?: string; kind?: "expense" | "income" | "transfer"; account_id?: number | null; to_account_id?: number | null }) =>
    req(`/finance`, { method: "POST", body: JSON.stringify(t) }),
  finance: (days = 30) => req<Txn[]>(`/finance?days=${days}`),
  financeBudget: () => req<{ budget: number; total_discretionary: number; total_fixed: number; safe_daily_base: number; safe_to_spend_today: number; days_in_month: number; days_remaining: number; } | null>(`/finance/budget`),
  txnDelete: (id: number) => req(`/finance/${id}`, { method: "DELETE" }),
  
  accounts: () => req<{ accounts: Account[]; grand?: { currency: string; value: number } | null; fx_ok?: boolean }>(`/accounts`),
  accountAdd: (a: { name: string; type: "bank" | "cash" | "credit_card" | "receivable" | "payable"; currency: string; initial_balance: number; funding_account_id?: number | null }) =>
    req(`/accounts`, { method: "POST", body: JSON.stringify(a) }),
  accountPatch: (id: number, patch: Partial<{ name: string; type: "bank" | "cash" | "credit_card" | "receivable" | "payable"; currency: string; initial_balance: number }>) =>
    req(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  accountDelete: (id: number) => req(`/accounts/${id}`, { method: "DELETE" }),
  timeActive: () => req<Session | null>(`/time/active`),
  timeStart: (label: string, category = "work") =>
    req(`/time/start`, { method: "POST", body: JSON.stringify({ label, category }) }),
  timeStop:  () => req(`/time/stop`, { method: "POST" }),
  timeLog:   (label: string, duration_seconds: number, category?: string) =>
    req(`/time/log`, { method: "POST", body: JSON.stringify({ label, duration_seconds, category }) }),
  timeAll:   (days = 30) => req<Session[]>(`/time?days=${days}`),
  chat: (q: string, model?: string, onChunk?: (t: string) => void) => {
    if (!onChunk) return req<{ answer: string }>(`/chat`, { method: "POST", body: JSON.stringify({ q, model }) });
    return authFetch(`/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q, model, stream: true }) })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        const contentType = r.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
           const j = await r.json();
           if (j.answer) onChunk(j.answer);
           return j as { answer: string };
        }
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          onChunk(chunk);
        }
        return { answer: full };
      });
  },
  calendar: (month: string) => req<{ day: string; preview: string }[]>(`/calendar/${month}`),
  googleCalendar: () => req<{ id: string; title: string; date: string; type: "event" | "task"; done?: boolean }[]>(`/calendar/google`),
  tasks:      (filter: "open" | "done" | "all" = "open") => req<Task[]>(`/tasks?filter=${filter}`),
  taskAdd:    (t: { title: string; notes?: string; priority?: 1 | 2 | 3; due_date?: string; due_time?: string; is_important?: boolean; is_urgent?: boolean; duration_minutes?: number }) =>
    req(`/tasks`, { method: "POST", body: JSON.stringify(t) }),
  taskSync:   () => req<{ updated: number; imported: number }>(`/tasks/sync`, { method: "POST" }),
  taskPatch:  (id: number, patch: Partial<{ title: string; notes: string; priority: 1 | 2 | 3; due_date: string | null; due_time: string | null; done: boolean; is_important: boolean; is_urgent: boolean }>) =>
    req(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  taskDelete: (id: number) => req(`/tasks/${id}`, { method: "DELETE" }),

  stats:  (days = 30) => req<Stats>(`/stats?days=${days}`),

  sleepGet:    (day: string) => req<SleepEntry>(`/sleep/${day}`),
  sleepSave:   (day: string, body: Partial<SleepEntry>) =>
    req(`/sleep/${day}`, { method: "POST", body: JSON.stringify(body) }),
  sleepList:   (days = 30) => req<SleepEntry[]>(`/sleep?days=${days}`),

  winsGet:       (day: string) => req<{ id: number; text: string }[]>(`/wins/${day}`),
  winAdd:        (day: string, text: string) =>
    req(`/wins/${day}`,       { method: "POST", body: JSON.stringify({ text }) }),
  winDelete:     (id: number) => req(`/wins/${id}`,       { method: "DELETE" }),
  gratitudesGet: (day: string) => req<{ id: number; text: string }[]>(`/gratitudes/${day}`),
  gratitudeAdd:  (day: string, text: string) =>
    req(`/gratitudes/${day}`, { method: "POST", body: JSON.stringify({ text }) }),
  gratitudeDelete: (id: number) => req(`/gratitudes/${id}`, { method: "DELETE" }),

  habits:      () => req<Habit[]>(`/habits`),
  habitAdd:    (h: { name: string; cadence?: "daily" | "weekly"; target_per_week?: number; color?: string }) =>
    req(`/habits`, { method: "POST", body: JSON.stringify(h) }),
  habitDelete: (id: number) => req(`/habits/${id}`, { method: "DELETE" }),
  habitLog:    (id: number, day: string, note?: string) =>
    req(`/habits/${id}/log`, { method: "POST", body: JSON.stringify({ day, note }) }),
  habitUnlog:  (id: number, day: string) =>
    req(`/habits/${id}/log/${day}`, { method: "DELETE" }),
  habitGrid:   (days = 30) => req<HabitGrid>(`/habits/grid?days=${days}`),

  mood2dLog:   (m: { valence: number; energy: number; tag?: string; note?: string }) =>
    req(`/mood2d`, { method: "POST", body: JSON.stringify(m) }),

  weeklyReview: () => req<WeeklyReview>(`/review/week`),

  llmProviders: () => req<{ id: string; label: string; baseUrl: string; defaultModel: string; needsKey: boolean }[]>(`/llm/providers`),
  llmConfig:    () => req<LLMConfig | null>(`/llm/config`),
  llmSave:      (c: { provider: string; api_key?: string; model: string; base_url?: string | null; auth_type?: "api_key" | "oauth"; context_days?: number }) =>
    req(`/llm/config`, { method: "PUT", body: JSON.stringify(c) }),
  llmTest:      () => req<{ ok: boolean; reply?: string; error?: string }>(`/llm/test`, { method: "POST" }),

  authStatus:      () => req<{ github_copilot: boolean; anthropic: boolean; google: boolean }>(`/auth/status`),
  copilotStart:    (enterpriseDomain?: string) =>
    req<{ user_code: string; verification_uri: string; device_code: string; interval: number; expires_in: number }>(
      `/auth/copilot/start`, { method: "POST", body: JSON.stringify({ enterpriseDomain }) }),
  copilotPoll:     (device_code: string) =>
    req<{ status: "pending" | "complete" | "failed"; error?: string }>(
      `/auth/copilot/poll`, { method: "POST", body: JSON.stringify({ device_code }) }),
  anthropicStart:  () => req<{ auth_url: string; redirect_uri: string }>(`/auth/anthropic/start`, { method: "POST" }),
  anthropicPoll:   () => req<{ status: "pending" | "complete" | "failed"; error?: string }>(
    `/auth/anthropic/poll`, { method: "POST" }),
  anthropicManual: (input: string) => req<{ status: "complete" | "failed"; error?: string }>(
    `/auth/anthropic/manual`, { method: "POST", body: JSON.stringify({ input }) }),
  googleExchangeCode: (code: string, redirect_uri: string) => 
    req(`/auth/google/exchange`, { method: "POST", body: JSON.stringify({ code, redirect_uri }) }),
  authLogout:      (provider: "github_copilot" | "anthropic" | "google") =>
    req(`/auth/${provider}/logout`, { method: "POST" }),

  profileGet:  () => req<Profile | null>(`/profile`),
  profileSave: (p: Profile) => req(`/profile`, { method: "PUT", body: JSON.stringify(p) }),

  weightList: (days = 90) => req<{ day: string; kg: number; note: string | null }[]>(`/weight?days=${days}`),
  weightAdd:  (kg: number, day?: string, note?: string) =>
    req(`/weight`, { method: "POST", body: JSON.stringify({ kg, day, note }) }),
  weightDelete: (day: string) => req(`/weight/${day}`, { method: "DELETE" }),

  waterAdd: (ml: number, day?: string) =>
    req(`/water`, { method: "POST", body: JSON.stringify({ ml, day }) }),

  mealsForDay: (day: string) => req<Meal[]>(`/meals?day=${day}`),
  mealsDaily:  (days = 30) => req<{ d: string; kcal: number; p: number; c: number; f: number }[]>(`/meals/daily?days=${days}`),
  mealAdd:     (m: { name: string; kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number; note?: string; meal_type?: string }) =>
    req(`/meals`, { method: "POST", body: JSON.stringify(m) }),
  mealEstimate: (text: string) => req<{ ok: boolean; data: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } }>(`/meals/estimate`, { method: "POST", body: JSON.stringify({ text }) }),
  mealDelete:  (id: number) => req(`/meals/${id}`, { method: "DELETE" }),

  holdings:      (force = false) => req<HoldingsResp>(`/holdings${force ? "?force=1" : ""}`),
  holdingAdd:    (h: { symbol: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; shares: number; cost_basis: number; currency?: string; note?: string; monthly_contribution?: number }) =>
    req(`/holdings`, { method: "POST", body: JSON.stringify(h) }),
  holdingDelete: (id: number) => req(`/holdings/${id}`, { method: "DELETE" }),
  holdingPatch: (id: number, patch: { monthly_contribution?: number; shares?: number; cost_basis?: number; symbol?: string; kind?: string }) =>
    req(`/holdings/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  holdingsImport: (file: File, replace = true) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("replace", replace ? "1" : "0");
    return authFetch(`/holdings/import`, { method: "POST", body: fd })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        return j as { source: string; imported: number; skipped: number; consolidated?: number };
      });
  },
  holdingsSyncGmail: () => req<{ ok: boolean; imported: number; error?: string }>(`/holdings/sync-gmail`, { method: "POST" }),
  holdingsResolve: () => req<{ tried: number; resolved: number }>(`/holdings/resolve`, { method: "POST" }),
  holdingsAdvice: (force = false, onChunk?: (t: string) => void) => {
    if (!onChunk) return req<{ advice?: string; error?: string; cached?: boolean }>(`/holdings/advice`, { method: "POST", body: JSON.stringify({ force }) });
    return authFetch(`/holdings/advice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force, stream: true }) })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        const contentType = r.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
           const j = await r.json();
           if (j.advice) onChunk(j.advice);
           return j as { advice?: string; error?: string; cached?: boolean };
        }
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          onChunk(chunk);
        }
        return { advice: full } as { advice?: string; error?: string; cached?: boolean };
      });
  },
  holdingsAdvisor: (messages: { role: "user" | "assistant"; content: string }[], onChunk?: (t: string) => void) => {
    if (!onChunk) return req<{ answer?: string; error?: string }>(`/holdings/advisor`, { method: "POST", body: JSON.stringify({ messages }) });
    return authFetch(`/holdings/advisor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, stream: true }) })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text());
        const reader = r.body!.getReader();
        const decoder = new TextDecoder();
        let full = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          onChunk(chunk);
        }
        return { answer: full } as { answer?: string; error?: string };
      });
  },
  holdingsSearch: (q: string) =>
    req<Array<{ symbol: string; name: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; currency: string; source: "preset"|"yahoo"|"amfi"; exchange?: string; nav?: number }>>(`/holdings/search?q=${encodeURIComponent(q)}`),

  financeImport: (csv: string) =>
    authFetch(`/finance/import`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv })
      .then(r => r.json() as Promise<{ imported: number; failed: number }>),

  devSeed: (days = 60) => authFetch(`/dev/seed?days=${days}`, { method: "POST" }).then(r => r.json()),
  devWipe: () => authFetch(`/dev/wipe`, { method: "POST" }).then(r => r.json()),
  devImport: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return authFetch(`/dev/import`, { method: "POST", body: fd }).then(r => r.json());
  },
};

export type Stats = {
  labels: string[];
  spend: number[];
  mood: (number | null)[];
  hours: number[];
  weight?: (number | null)[];
  kcal?: number[];
  sleep?: (number | null)[];
  water?: number[];
  categories: { labels: string[]; values: number[] };
};
export type Txn = { id: number; ts: string; amount: number; category: string; note: string | null; kind: "expense" | "income" | "transfer"; account_id: number | null; to_account_id: number | null };
export type Session = { id: number; label: string; category: string; started_at: string; ended_at: string | null };
export type Account = {
  id: number; name: string; type: "bank" | "cash" | "credit_card" | "receivable" | "payable"; currency: string;
  initial_balance: number; balance: number; created_at: string;
};
export type Task = {
  id: number; title: string; notes: string | null;
  priority: 1 | 2 | 3; due_date: string | null; due_time: string | null; done: 0 | 1;
  is_important: 0 | 1; is_urgent: 0 | 1; duration_minutes: number;
  created_at: string; done_at: string | null;
};

export type Summary = {
  day: string;
  range_days?: number;
  mood:  { today: number | null; week: number | null; latest?: number | null; latest_ts?: string | null };
  spend: { today: number; week: number };
  time:  { today: number };
  tasks: { open: number; overdue: number; done_today: number };
  sleep: { last: SleepEntry | null; avg7: number | null };
  positive: { wins: number; gratitude: number };
  weight?: { last: number | null; day: string | null; delta: number | null };
  calories?: { today: number; avg: number };
  water?: { today: number };
};
export type SleepEntry = {
  day: string; bedtime: string | null; waketime: string | null;
  hours: number | null; quality: number | null; note: string | null;
};
export type Habit = { id: number; name: string; cadence: string; target_per_week: number; color: string };
export type HabitGrid = {
  labels: string[];
  habits: (Habit & { marks: boolean[]; consistency: number; streak: number })[];
};
export type WeeklyReview = {
  review: string | null;
  error?: string;
  data: any;
};

export type LLMConfig = {
  provider: string;
  api_key: string | null;
  has_key: boolean;
  model: string;
  base_url: string | null;
  auth_type?: "api_key" | "oauth";
  context_days?: number;
};

export type Profile = {
  name: string;
  dob?: string | null;
  pronouns?: string | null;
  timezone?: string | null;
  currency?: string | null;
  sleep_target_hours?: number | null;
  values?: string | null;
  goal?: string | null;
  vault_path?: string | null;
  journal_subdir?: string | null;
  alias?: string | null;
  google_client_id?: string | null;
  google_client_secret?: string | null;
  monthly_budget?: number | null;
  fixed_categories?: string | null;
};

export type Meal = { id: number; ts: string; name: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null; note: string | null; meal_type: "breakfast" | "lunch" | "dinner" | "snack" };
export type Holding = {
  id: number; symbol: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt";
  shares: number; cost_basis: number; currency: string;
  price: number; value: number; cost: number; gain: number; gain_pct: number;
  daily_gain?: number; daily_gain_pct?: number;
  quote_currency: string;
  monthly_contribution?: number;
};
export type HoldingsResp = {
  holdings: Holding[]; total: number; cost: number; gain: number;
  grand?: { currency: string; value: number; cost: number; gain: number; pct: number; daily_gain?: number } | null;
  market_live?: { in: boolean; us: boolean };
  fx_ok?: boolean;
};
