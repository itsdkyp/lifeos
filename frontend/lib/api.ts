const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export const api = {
  summary: (days = 7) => req<Summary>(`/summary?days=${days}`),
  journalGet: (day: string) => req<{ day: string; content: string }>(`/journal/${day}`),
  journalSave: (day: string, content: string) =>
    req(`/journal/${day}`, { method: "POST", body: JSON.stringify({ content }) }),
  logMood: (score: number, note = "") =>
    req(`/mood`, { method: "POST", body: JSON.stringify({ score, note }) }),
  addTxn: (t: { amount: number; category: string; note?: string; kind?: "expense" | "income" }) =>
    req(`/finance`, { method: "POST", body: JSON.stringify(t) }),
  finance: (days = 30) => req<Txn[]>(`/finance?days=${days}`),
  txnDelete: (id: number) => req(`/finance/${id}`, { method: "DELETE" }),
  timeActive: () => req<Session | null>(`/time/active`),
  timeStart: (label: string, category = "work") =>
    req(`/time/start`, { method: "POST", body: JSON.stringify({ label, category }) }),
  timeStop:  () => req(`/time/stop`, { method: "POST" }),
  timeAll:   (days = 30) => req<Session[]>(`/time?days=${days}`),
  chat: (q: string, model?: string) =>
    req<{ answer: string }>(`/chat`, { method: "POST", body: JSON.stringify({ q, model }) }),
  calendar: (month: string) => req<{ day: string; preview: string }[]>(`/calendar/${month}`),
  tasks:      (filter: "open" | "done" | "all" = "open") => req<Task[]>(`/tasks?filter=${filter}`),
  taskAdd:    (t: { title: string; notes?: string; priority?: 1 | 2 | 3; due_date?: string }) =>
    req(`/tasks`, { method: "POST", body: JSON.stringify(t) }),
  taskPatch:  (id: number, patch: Partial<{ title: string; notes: string; priority: 1 | 2 | 3; due_date: string | null; done: boolean }>) =>
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
  llmSave:      (c: { provider: string; api_key?: string; model: string; base_url?: string | null }) =>
    req(`/llm/config`, { method: "PUT", body: JSON.stringify(c) }),
  llmTest:      () => req<{ ok: boolean; reply?: string; error?: string }>(`/llm/test`, { method: "POST" }),

  authStatus:      () => req<{ github_copilot: boolean; anthropic: boolean }>(`/auth/status`),
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
  authLogout:      (provider: "github_copilot" | "anthropic") =>
    req(`/auth/${provider}/logout`, { method: "POST" }),

  profileGet:  () => req<Profile | null>(`/profile`),
  profileSave: (p: Profile) => req(`/profile`, { method: "PUT", body: JSON.stringify(p) }),

  weightList: (days = 90) => req<{ day: string; kg: number; note: string | null }[]>(`/weight?days=${days}`),
  weightAdd:  (kg: number, day?: string, note?: string) =>
    req(`/weight`, { method: "POST", body: JSON.stringify({ kg, day, note }) }),
  weightDelete: (day: string) => req(`/weight/${day}`, { method: "DELETE" }),

  mealsForDay: (day: string) => req<Meal[]>(`/meals?day=${day}`),
  mealsDaily:  (days = 30) => req<{ d: string; kcal: number; p: number; c: number; f: number }[]>(`/meals/daily?days=${days}`),
  mealAdd:     (m: { name: string; kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number; note?: string }) =>
    req(`/meals`, { method: "POST", body: JSON.stringify(m) }),
  mealDelete:  (id: number) => req(`/meals/${id}`, { method: "DELETE" }),

  holdings:      () => req<HoldingsResp>(`/holdings`),
  holdingAdd:    (h: { symbol: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; shares: number; cost_basis: number; currency?: string; note?: string; monthly_contribution?: number }) =>
    req(`/holdings`, { method: "POST", body: JSON.stringify(h) }),
  holdingDelete: (id: number) => req(`/holdings/${id}`, { method: "DELETE" }),
  holdingsImport: (file: File, replace = true) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("replace", replace ? "1" : "0");
    return fetch(`${API}/holdings/import`, { method: "POST", body: fd })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? r.statusText);
        return j as { source: string; imported: number; skipped: number; consolidated?: number };
      });
  },
  holdingsResolve: () => req<{ tried: number; resolved: number }>(`/holdings/resolve`, { method: "POST" }),
  holdingsAdvice: (force = false) =>
    req<{ advice?: string; error?: string; cached?: boolean }>(`/holdings/advice`, { method: "POST", body: JSON.stringify({ force }) }),
  holdingsAdvisor: (messages: { role: "user" | "assistant"; content: string }[]) =>
    req<{ answer?: string; error?: string }>(`/holdings/advisor`, { method: "POST", body: JSON.stringify({ messages }) }),
  holdingsSearch: (q: string) =>
    req<Array<{ symbol: string; name: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; currency: string; source: "preset"|"yahoo"|"amfi"; exchange?: string; nav?: number }>>(`/holdings/search?q=${encodeURIComponent(q)}`),

  financeImport: (csv: string) =>
    fetch(`${API}/finance/import`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: csv })
      .then(r => r.json() as Promise<{ imported: number; failed: number }>),

  devSeed: (days = 60) => fetch(`${API}/dev/seed?days=${days}`, { method: "POST" }).then(r => r.json()),
  devWipe: () => fetch(`${API}/dev/wipe`, { method: "POST" }).then(r => r.json()),
};

export type Stats = {
  labels: string[];
  spend: number[];
  mood: (number | null)[];
  hours: number[];
  weight?: (number | null)[];
  kcal?: number[];
  sleep?: (number | null)[];
  categories: { labels: string[]; values: number[] };
};
export type Txn = { id: number; ts: string; amount: number; category: string; note: string | null; kind: "expense" | "income" };
export type Session = { id: number; label: string; category: string; started_at: string; ended_at: string | null };
export type Task = {
  id: number; title: string; notes: string | null;
  priority: 1 | 2 | 3; due_date: string | null; done: 0 | 1;
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
};

export type Meal = { id: number; ts: string; name: string; kcal: number; protein_g: number | null; carbs_g: number | null; fat_g: number | null; note: string | null };
export type Holding = {
  id: number; symbol: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt";
  shares: number; cost_basis: number; currency: string;
  price: number; value: number; cost: number; gain: number; gain_pct: number;
  quote_currency: string;
};
export type HoldingsResp = {
  holdings: Holding[]; total: number; cost: number; gain: number;
  grand?: { currency: string; value: number; cost: number; gain: number; pct: number } | null;
  fx_ok?: boolean;
};
