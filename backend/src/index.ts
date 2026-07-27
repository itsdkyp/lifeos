import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { q, q1, run } from "./db.ts";
import { syncDay } from "./obsidian.ts";
import { askLLM, callChat, getConfig, PROVIDERS, type Provider } from "./llm.ts";
import { importBrokerFile, type NormHolding } from "./importers.ts";
import {
  copilotStartDevice, copilotPollDevice, copilotGetAuth,
  anthropicStart, anthropicPoll, anthropicFinishManual,
  getToken, clearToken,
} from "./oauth.ts";

const app = new Hono();
app.use("*", cors({ origin: "*" }));

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const now   = () => new Date().toISOString();

// ── health ────────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ ok: true, ts: now() }));

// ── profile ───────────────────────────────────────────────────────────────────────────
app.get("/profile", (c) => {
  const p = q1<any>("SELECT * FROM profile WHERE id=1");
  if (!p) return c.json(null);
  // expose as `values` externally, store as `values_json` internally
  const { values_json, ...rest } = p;
  return c.json({ ...rest, values: values_json ?? null });
});

app.put("/profile",
  zValidator("json", z.object({
    name: z.string().min(1),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    pronouns: z.string().nullable().optional(),
    timezone: z.string().nullable().optional(),
    currency: z.string().max(6).nullable().optional(),
    sleep_target_hours: z.number().min(0).max(24).nullable().optional(),
    values: z.string().nullable().optional(),
    goal: z.string().nullable().optional(),
  })),
  (c) => {
    const p = c.req.valid("json");
    const existing = q1<{ created_at: string }>("SELECT created_at FROM profile WHERE id=1");
    const created = existing?.created_at ?? now();
    run(`INSERT INTO profile(id,name,dob,pronouns,timezone,currency,sleep_target_hours,values_json,goal,created_at,updated_at)
         VALUES(1,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name, dob=excluded.dob, pronouns=excluded.pronouns,
           timezone=excluded.timezone, currency=excluded.currency,
           sleep_target_hours=excluded.sleep_target_hours,
           values_json=excluded.values_json, goal=excluded.goal,
           updated_at=excluded.updated_at`,
      p.name, p.dob ?? null, p.pronouns ?? null, p.timezone ?? null,
      p.currency ?? "USD", p.sleep_target_hours ?? 8, p.values ?? null, p.goal ?? null,
      created, now());
    return c.json({ ok: true });
  });

// ── journal ───────────────────────────────────────────────────────────────
app.get("/journal/:day", (c) => {
  const day = c.req.param("day");
  const row = q1<{ content: string }>("SELECT content FROM journals WHERE day=?", day);
  return c.json({ day, content: row?.content ?? "" });
});

app.post("/journal/:day",
  zValidator("json", z.object({ content: z.string() })),
  async (c) => {
    const day = c.req.param("day");
    const { content } = c.req.valid("json");
    run(`INSERT INTO journals(day,content,updated_at) VALUES(?,?,?)
         ON CONFLICT(day) DO UPDATE SET content=excluded.content, updated_at=excluded.updated_at`,
        day, content, now());
    const path = await syncDay(day);
    return c.json({ ok: true, path });
  });

// ── mood ──────────────────────────────────────────────────────────────────
app.post("/mood",
  zValidator("json", z.object({ score: z.number().int().min(1).max(10), note: z.string().optional() })),
  async (c) => {
    const { score, note } = c.req.valid("json");
    run("INSERT INTO moods(ts,score,note) VALUES(?,?,?)", now(), score, note ?? null);
    await syncDay(today());
    return c.json({ ok: true });
  });

// ── finance ───────────────────────────────────────────────────────────────
app.post("/finance",
  zValidator("json", z.object({
    amount: z.number().positive(),
    category: z.string().min(1),
    note: z.string().optional(),
    kind: z.enum(["expense", "income"]).default("expense"),
  })),
  async (c) => {
    const { amount, category, note, kind } = c.req.valid("json");
    run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
        now(), amount, category, note ?? null, kind);
    await syncDay(today());
    return c.json({ ok: true });
  });

app.get("/finance", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return c.json(q("SELECT * FROM transactions WHERE ts>=? ORDER BY ts DESC", since));
});

app.delete("/finance/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = q1<{ ts: string }>("SELECT ts FROM transactions WHERE id=?", id);
  run("DELETE FROM transactions WHERE id=?", id);
  if (row) await syncDay(row.ts.slice(0, 10));
  return c.json({ ok: true });
});

// ── time tracking ─────────────────────────────────────────────────────────
app.get("/time/active", (c) =>
  c.json(q1("SELECT * FROM time_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1")));

app.post("/time/start",
  zValidator("json", z.object({ label: z.string().min(1), category: z.string().optional() })),
  (c) => {
    let { label, category } = c.req.valid("json");
    label = label.trim().toLowerCase();
    const cat = category ?? inferCategory(label);
    const active = q1<{ label: string }>("SELECT label FROM time_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1");
    if (active && active.label.toLowerCase() === label) return c.json({ ok: true, already: true });
    run("UPDATE time_sessions SET ended_at=? WHERE ended_at IS NULL", now());
    run("INSERT INTO time_sessions(label,category,started_at) VALUES(?,?,?)", label, cat, now());
    return c.json({ ok: true });
  });

app.post("/time/stop", async (c) => {
  run("UPDATE time_sessions SET ended_at=? WHERE ended_at IS NULL", now());
  await syncDay(today());
  return c.json({ ok: true });
});

app.get("/time", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString();
  return c.json(q("SELECT * FROM time_sessions WHERE started_at>=? ORDER BY started_at DESC", since));
});

// ── tasks ──────────────────────────────────────────────────────────────────────────────────────────────
app.get("/tasks", (c) => {
  const filter = c.req.query("filter") ?? "open"; // open | done | all
  const where = filter === "open" ? "WHERE done=0" : filter === "done" ? "WHERE done=1" : "";
  return c.json(q(
    `SELECT * FROM tasks ${where}
     ORDER BY done, (due_date IS NULL), due_date, priority DESC, id DESC`));
});

app.post("/tasks",
  zValidator("json", z.object({
    title: z.string().min(1),
    notes: z.string().optional(),
    priority: z.number().int().min(1).max(3).default(2),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })),
  async (c) => {
    const t = c.req.valid("json");
    run("INSERT INTO tasks(title,notes,priority,due_date,created_at) VALUES(?,?,?,?,?)",
        t.title, t.notes ?? null, t.priority, t.due_date ?? null, now());
    if (t.due_date) await syncDay(t.due_date);
    return c.json({ ok: true });
  });

app.patch("/tasks/:id",
  zValidator("json", z.object({
    title: z.string().min(1).optional(),
    notes: z.string().optional(),
    priority: z.number().int().min(1).max(3).optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    done: z.boolean().optional(),
  })),
  async (c) => {
    const id = Number(c.req.param("id"));
    const patch = c.req.valid("json");
    const existing = q1<{ due_date: string | null; done: number }>("SELECT due_date, done FROM tasks WHERE id=?", id);
    if (!existing) return c.json({ error: "not found" }, 404);
    const sets: string[] = [], vals: any[] = [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      sets.push(`${k}=?`);
      vals.push(k === "done" ? (v ? 1 : 0) : v);
    }
    if (patch.done === true && !existing.done)  { sets.push("done_at=?"); vals.push(now()); }
    if (patch.done === false && existing.done)  { sets.push("done_at=?"); vals.push(null); }
    if (sets.length) { vals.push(id); run(`UPDATE tasks SET ${sets.join(",")} WHERE id=?`, ...vals); }
    // resync affected days
    const daysToSync = new Set<string>();
    if (existing.due_date) daysToSync.add(existing.due_date);
    if (typeof patch.due_date === "string") daysToSync.add(patch.due_date);
    if (patch.done !== undefined) daysToSync.add(today());
    for (const d of daysToSync) await syncDay(d);
    return c.json({ ok: true });
  });

app.delete("/tasks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const t = q1<{ due_date: string | null }>("SELECT due_date FROM tasks WHERE id=?", id);
  run("DELETE FROM tasks WHERE id=?", id);
  if (t?.due_date) await syncDay(t.due_date);
  return c.json({ ok: true });
});

// ── sleep ─────────────────────────────────────────────────────────────────────────────────────────
app.get("/sleep/:day", (c) => {
  const day = c.req.param("day");
  return c.json(q1("SELECT * FROM sleep WHERE day=?", day) ?? {});
});
app.post("/sleep/:day",
  zValidator("json", z.object({
    bedtime: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
    waketime: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().optional(),
    hours: z.number().min(0).max(24).nullable().optional(),
    quality: z.number().int().min(1).max(10).nullable().optional(),
    note: z.string().nullable().optional(),
  })),
  async (c) => {
    const day = c.req.param("day");
    const b = c.req.valid("json");
    // Compute hours from bed/wake if not supplied
    let hours = b.hours ?? null;
    if (hours == null && b.bedtime && b.waketime) {
      const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h! * 60 + m!; };
      let d = toMin(b.waketime) - toMin(b.bedtime);
      if (d < 0) d += 24 * 60;                  // bedtime after midnight
      if (b.bedtime > b.waketime && d > 12*60) d = 24*60 - d;
      hours = Math.round((d / 60) * 10) / 10;
    }
    run(`INSERT INTO sleep(day,bedtime,waketime,hours,quality,note,updated_at)
         VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET
           bedtime=COALESCE(excluded.bedtime, sleep.bedtime),
           waketime=COALESCE(excluded.waketime, sleep.waketime),
           hours=COALESCE(excluded.hours, sleep.hours),
           quality=COALESCE(excluded.quality, sleep.quality),
           note=COALESCE(excluded.note, sleep.note),
           updated_at=excluded.updated_at`,
        day, b.bedtime ?? null, b.waketime ?? null, hours, b.quality ?? null, b.note ?? null, now());
    await syncDay(day);
    return c.json({ ok: true });
  });
app.get("/sleep", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return c.json(q("SELECT * FROM sleep WHERE day>=? ORDER BY day DESC", since));
});

// ── wins / gratitude ────────────────────────────────────────────────────────────────────────────────
app.get("/wins/:day",       (c) => c.json(q("SELECT * FROM wins WHERE day=? ORDER BY id", c.req.param("day"))));
app.get("/gratitudes/:day", (c) => c.json(q("SELECT * FROM gratitudes WHERE day=? ORDER BY id", c.req.param("day"))));

app.post("/wins/:day",
  zValidator("json", z.object({ text: z.string().min(1) })),
  async (c) => {
    const day = c.req.param("day");
    run("INSERT INTO wins(day,ts,text) VALUES(?,?,?)", day, now(), c.req.valid("json").text);
    await syncDay(day);
    return c.json({ ok: true });
  });

app.post("/gratitudes/:day",
  zValidator("json", z.object({ text: z.string().min(1) })),
  async (c) => {
    const day = c.req.param("day");
    run("INSERT INTO gratitudes(day,ts,text) VALUES(?,?,?)", day, now(), c.req.valid("json").text);
    await syncDay(day);
    return c.json({ ok: true });
  });

app.delete("/wins/:id",       async (c) => { const r = q1<{ day: string }>("SELECT day FROM wins WHERE id=?", Number(c.req.param("id"))); run("DELETE FROM wins WHERE id=?", Number(c.req.param("id"))); if (r) await syncDay(r.day); return c.json({ ok: true }); });
app.delete("/gratitudes/:id", async (c) => { const r = q1<{ day: string }>("SELECT day FROM gratitudes WHERE id=?", Number(c.req.param("id"))); run("DELETE FROM gratitudes WHERE id=?", Number(c.req.param("id"))); if (r) await syncDay(r.day); return c.json({ ok: true }); });

// ── habits ───────────────────────────────────────────────────────────────────────────────────────
app.get("/habits", (c) => c.json(q("SELECT * FROM habits WHERE archived=0 ORDER BY id")));

app.post("/habits",
  zValidator("json", z.object({
    name: z.string().min(1),
    cadence: z.enum(["daily", "weekly"]).default("daily"),
    target_per_week: z.number().int().min(1).max(7).default(7),
    color: z.string().default("#60a5fa"),
  })),
  (c) => {
    const h = c.req.valid("json");
    run("INSERT INTO habits(name,cadence,target_per_week,color,created_at) VALUES(?,?,?,?,?)",
        h.name, h.cadence, h.target_per_week, h.color, now());
    return c.json({ ok: true });
  });

app.delete("/habits/:id", (c) => {
  run("UPDATE habits SET archived=1 WHERE id=?", Number(c.req.param("id")));
  return c.json({ ok: true });
});

app.post("/habits/:id/log",
  zValidator("json", z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), note: z.string().optional() })),
  async (c) => {
    const { day, note } = c.req.valid("json");
    run("INSERT INTO habit_logs(habit_id,day,note) VALUES(?,?,?) ON CONFLICT(habit_id,day) DO UPDATE SET note=excluded.note",
        Number(c.req.param("id")), day, note ?? null);
    await syncDay(day);
    return c.json({ ok: true });
  });

app.delete("/habits/:id/log/:day", async (c) => {
  const day = c.req.param("day");
  run("DELETE FROM habit_logs WHERE habit_id=? AND day=?", Number(c.req.param("id")), day);
  await syncDay(day);
  return c.json({ ok: true });
});

/** Habit consistency grid for last N days per habit. */
app.get("/habits/grid", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) labels.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  const habits = q<{ id: number; name: string; color: string; target_per_week: number }>(
    "SELECT id,name,color,target_per_week FROM habits WHERE archived=0 ORDER BY id");
  const logs = q<{ habit_id: number; day: string }>(
    "SELECT habit_id, day FROM habit_logs WHERE day>=?", labels[0]!);
  const logSet = new Set(logs.map(l => `${l.habit_id}:${l.day}`));
  return c.json({
    labels,
    habits: habits.map(h => {
      const marks = labels.map(d => logSet.has(`${h.id}:${d}`));
      const done = marks.filter(Boolean).length;
      const consistency = Math.round((done / labels.length) * 100);
      // current streak (from today backwards)
      let streak = 0;
      for (let i = marks.length - 1; i >= 0; i--) { if (marks[i]) streak++; else break; }
      return { ...h, marks, consistency, streak };
    }),
  });
});

// ── mood2d ───────────────────────────────────────────────────────────────────────────────────────
app.post("/mood2d",
  zValidator("json", z.object({
    energy:  z.number().int().min(1).max(10),
    valence: z.number().int().min(1).max(10),
    tag:     z.string().optional(),
    note:    z.string().optional(),
  })),
  async (c) => {
    const m = c.req.valid("json");
    run("INSERT INTO mood2d(ts,energy,valence,tag,note) VALUES(?,?,?,?,?)",
        now(), m.energy, m.valence, m.tag ?? null, m.note ?? null);
    await syncDay(today());
    return c.json({ ok: true });
  });

// ── summary (dashboard read-model) ─────────────────────────────────────────────────────────────
app.get("/summary", (c) => {
  const days = Number(c.req.query("days") ?? 7);   // rolling window for "week" stats
  const d = today();
  const windowStart = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString();

  const todayMood = q1<{ v: number | null }>(
    "SELECT AVG(valence) v FROM mood2d WHERE date(ts, 'localtime')=?", d) ??
    q1<{ v: number | null }>("SELECT AVG(score) v FROM moods WHERE date(ts, 'localtime')=?", d);
  const latestMood = q1<{ v: number | null; ts: string | null }>(
    "SELECT valence v, ts FROM mood2d WHERE date(ts, 'localtime')=? ORDER BY ts DESC LIMIT 1", d);
  const weekMood = q1<{ v: number | null }>(
    "SELECT AVG(valence) v FROM mood2d WHERE date(ts, 'localtime')>=?", windowStart);

  const todaySpend = q1<{ v: number }>(
    "SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE kind='expense' AND date(ts, 'localtime')=?", d)!.v;
  const weekSpend = q1<{ v: number }>(
    "SELECT COALESCE(SUM(amount),0) v FROM transactions WHERE kind='expense' AND date(ts, 'localtime')>=?", windowStart)!.v;

  const todayHours = q1<{ v: number | null }>(
    "SELECT COALESCE(SUM((julianday(ended_at)-julianday(started_at))*24),0) v FROM time_sessions WHERE ended_at IS NOT NULL AND date(started_at, 'localtime')=?", d)!.v ?? 0;

  const openTasks = q1<{ v: number }>("SELECT COUNT(*) v FROM tasks WHERE done=0")!.v;
  const overdueTasks = q1<{ v: number }>("SELECT COUNT(*) v FROM tasks WHERE done=0 AND due_date<?", d)!.v;
  const doneToday = q1<{ v: number }>("SELECT COUNT(*) v FROM tasks WHERE date(done_at, 'localtime')=?", d)!.v;

  const sleepLast = q1<any>("SELECT * FROM sleep WHERE hours IS NOT NULL ORDER BY day DESC LIMIT 1");
  const sleep7 = q1<{ v: number | null }>("SELECT AVG(hours) v FROM sleep WHERE day>=?", windowStart);

  const winsToday = q1<{ v: number }>("SELECT COUNT(*) v FROM wins WHERE day=?", d)!.v;
  const gratToday = q1<{ v: number }>("SELECT COUNT(*) v FROM gratitudes WHERE day=?", d)!.v;

  const weightLast = q1<{ day: string; kg: number }>("SELECT day, kg FROM weight ORDER BY day DESC LIMIT 1");
  const weightWeekAgo = q1<{ kg: number }>("SELECT kg FROM weight WHERE day<=? ORDER BY day DESC LIMIT 1", windowStart);

  const kcalToday = q1<{ v: number }>("SELECT COALESCE(SUM(kcal),0) v FROM meals WHERE date(ts, 'localtime')=?", d)!.v;
  const kcal7avg  = q1<{ v: number }>("SELECT COALESCE(AVG(daily),0) v FROM (SELECT SUM(kcal) daily FROM meals WHERE date(ts, 'localtime')>=? GROUP BY date(ts, 'localtime'))", windowStart)!.v;

  return c.json({
    day: d,
    range_days: days,
    mood:  { today: todayMood?.v ?? null,  week: weekMood?.v ?? null, latest: latestMood?.v ?? null, latest_ts: latestMood?.ts ?? null },
    spend: { today: todaySpend, week: weekSpend },
    time:  { today: Math.round(todayHours * 10) / 10 },
    tasks: { open: openTasks, overdue: overdueTasks, done_today: doneToday },
    sleep: { last: sleepLast, avg7: sleep7?.v ?? null },
    positive: { wins: winsToday, gratitude: gratToday },
    weight: { last: weightLast?.kg ?? null, day: weightLast?.day ?? null,
              delta: weightLast && weightWeekAgo ? Math.round((weightLast.kg - weightWeekAgo.kg)*10)/10 : null },
    calories: { today: kcalToday, avg: Math.round(kcal7avg) },
  });
});

// ── weekly review ───────────────────────────────────────────────────────────────────────────
app.get("/review/week", async (c) => {
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
  const wSince = weekAgo.slice(0, 10);
  const data = {
    range: { since: wSince, until: today() },
    journals:     q("SELECT day, content FROM journals WHERE day>=? ORDER BY day", wSince),
    wins:         q("SELECT day, text FROM wins WHERE day>=? ORDER BY day", wSince),
    gratitudes:   q("SELECT day, text FROM gratitudes WHERE day>=? ORDER BY day", wSince),
    transactions: q("SELECT date(ts, 'localtime') d, SUM(amount) total, category, kind FROM transactions WHERE date(ts, 'localtime')>=? GROUP BY d,category,kind ORDER BY d", wSince),
    moods:        q("SELECT date(ts, 'localtime') d, ROUND(AVG(valence),1) valence, ROUND(AVG(energy),1) energy FROM mood2d WHERE date(ts, 'localtime')>=? GROUP BY d", wSince),
    time:         q("SELECT date(started_at, 'localtime') d, label, category, ROUND((julianday(COALESCE(ended_at, ?))-julianday(started_at))*24,2) hours FROM time_sessions WHERE date(started_at, 'localtime')>=? ORDER BY started_at", now(), wSince),
    sleep:        q("SELECT day, hours, quality FROM sleep WHERE day>=? ORDER BY day", wSince),
    tasks_done:   q("SELECT title, priority, date(done_at, 'localtime') day FROM tasks WHERE date(done_at, 'localtime')>=?", wSince),
    tasks_open:   q("SELECT title, priority, due_date FROM tasks WHERE done=0"),
  };

  const profile = q1<any>("SELECT * FROM profile WHERE id=1");
  const age = profile?.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 864e5)) : null;
  const profileLine = profile
    ? `USER: ${profile.name}${age != null ? ` (age ${age})` : ""}${profile.pronouns ? `, ${profile.pronouns}` : ""}. Values: ${profile.values_json ?? "(unset)"}. Current focus: ${profile.goal ?? "(unset)"}. Sleep target: ${profile.sleep_target_hours ?? 8}h.`
    : "USER: unknown.";

  const prompt = `You are a compassionate life coach + therapist. Produce a weekly review from the user's data. Address them by first name. Tie observations back to their stated values and current focus when relevant. Structure exactly:
1. **What went well** — 3 concrete wins with dates/numbers.
2. **What was heavy** — 1–2 patterns to notice (never blame).
3. **Signals** — correlations you actually see (e.g. "low sleep → higher spend"). Cite numbers.
4. **One boulder for next week** — a single high-leverage focus.
5. **Three questions for reflection** — open, non-judgmental.
Keep it under 250 words. Be warm and specific. Never fabricate.`;

  try {
    const cfg = getConfig();
    if (!cfg) return c.json({ data, review: null, error: "LLM is not configured. Go to Settings → LLM to set it up." });
    const review = await callChat(cfg, [
      { role: "system", content: `${prompt}\n\n${profileLine}` },
      { role: "user", content: `DATA:\n${JSON.stringify(data)}` },
    ]);
    return c.json({ data, review });
  } catch (e: any) {
    return c.json({ data, review: null, error: String(e?.message ?? e) });
  }
});

// ── stats for charts ──────────────────────────────────────────────────────
app.get("/stats", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const labels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    labels.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
  }
  const since = labels[0]!;

  const spend  = new Map(q<{ d: string; total: number }>(
    "SELECT date(ts, 'localtime') d, SUM(amount) total FROM transactions WHERE kind='expense' AND date(ts, 'localtime')>=? GROUP BY d", since
  ).map(r => [r.d, r.total]));
  const mood   = new Map(q<{ d: string; avg: number }>(
    "SELECT date(ts, 'localtime') d, AVG(score) avg FROM moods WHERE date(ts, 'localtime')>=? GROUP BY d", since
  ).map(r => [r.d, Math.round(r.avg * 10) / 10]));
  // fold in mood2d (valence) so newer entries also show up
  for (const r of q<{ d: string; avg: number }>(
    "SELECT date(ts, 'localtime') d, AVG(valence) avg FROM mood2d WHERE date(ts, 'localtime')>=? GROUP BY d", since
  )) {
    const cur = mood.get(r.d);
    mood.set(r.d, cur != null ? (cur + r.avg) / 2 : Math.round(r.avg * 10) / 10);
  }
  const hours = new Map<string, number>();
  for (const s of q<{ started_at: string; ended_at: string }>(
    "SELECT started_at,ended_at FROM time_sessions WHERE ended_at IS NOT NULL AND date(started_at, 'localtime')>=?", since
  )) {
    const d = new Date(s.started_at).toLocaleDateString("sv-SE"); // yyyy-mm-dd local
    const h = (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 3.6e6;
    hours.set(d, (hours.get(d) ?? 0) + h);
  }
  const weight = new Map(q<{ day: string; kg: number }>(
    "SELECT day, kg FROM weight WHERE day>=?", since).map(r => [r.day, r.kg]));
  const kcal = new Map(q<{ d: string; total: number }>(
    "SELECT date(ts, 'localtime') d, SUM(kcal) total FROM meals WHERE date(ts, 'localtime')>=? GROUP BY d", since).map(r => [r.d, r.total]));
  const sleepH = new Map(q<{ day: string; hours: number | null }>(
    "SELECT day, hours FROM sleep WHERE day>=?", since).map(r => [r.day, r.hours]));

  const cats = q<{ category: string; total: number }>(
    "SELECT category, SUM(amount) total FROM transactions WHERE kind='expense' AND date(ts, 'localtime')>=? GROUP BY category ORDER BY total DESC", since);

  return c.json({
    labels,
    spend:  labels.map(d => Math.round((spend.get(d) ?? 0) * 100) / 100),
    mood:   labels.map(d => mood.get(d) ?? null),
    hours:  labels.map(d => Math.round((hours.get(d) ?? 0) * 100) / 100),
    weight: labels.map(d => weight.get(d) ?? null),
    kcal:   labels.map(d => kcal.get(d) ?? 0),
    sleep:  labels.map(d => sleepH.get(d) ?? null),
    categories: { labels: cats.map(x => x.category), values: cats.map(x => Math.round(x.total * 100) / 100) },
  });
});

// ── chat ──────────────────────────────────────────────────────────────────
app.post("/chat",
  zValidator("json", z.object({ q: z.string().min(1) })),
  async (c) => {
    const { q } = c.req.valid("json");
    // Try to execute a log intent before falling through to the LLM.
    try {
      const acted = await tryLogIntent(q);
      if (acted) return c.json({ answer: acted });
      return c.json({ answer: await askLLM(q) });
    } catch (e: any) { return c.json({ error: String(e?.message ?? e) }, 500); }
  });

// Lightweight intent parser: if the user says "log/set/update mood 3", execute
// and short-circuit. Mirrors the ⌘K palette but on the server.
async function tryLogIntent(raw: string): Promise<string | null> {
  // Multi-clause split — process each independent clause so "walked 15 min AND coffee ₹20" logs both.
  const clauses = raw.split(/\s+and\s+|\s*[;]\s*/i).map(c => c.trim()).filter(Boolean);
  if (clauses.length > 1) {
    const results: string[] = [];
    for (const c of clauses) {
      const r = await tryOneClause(c);
      if (r) results.push(r);
    }
    return results.length ? results.join("\n\n") : null;
  }
  return tryOneClause(raw);
}

async function tryOneClause(raw: string): Promise<string | null> {
  // ── Habit create (before task-completion so "add habit X" doesn't false-trigger) ──
  let habitMatch = raw.match(/\b(?:create|add|new|make|start|build)\s+(?:a\s+)?habit\s+(?:of|for|to|called|named|:)?\s*(.+?)[.!?]?$/i)
                || raw.match(/^habit:\s+(.+?)[.!?]?$/i);
  if (habitMatch) {
    const name = habitMatch[1]!.trim().toLowerCase().replace(/^(?:a|an|the)\s+/, "").replace(/^to\s+/, "");
    if (name && name.length >= 2) {
      const existing = q1<{ id: number }>("SELECT id FROM habits WHERE LOWER(name)=? AND archived=0", name);
      if (existing) return `Habit "${name}" already exists.`;
      run("INSERT INTO habits(name,cadence,target_per_week,color,created_at) VALUES(?,?,?,?,?)",
          name, "daily", 7, "#60a5fa", now());
      return `Habit added · ${name}. Check it off daily at /habits or say "habit ${name.split(" ")[0]}".`;
    }
  }

  // ── Task completion (must run BEFORE task-add so "I have applied X" doesn't create a task) ──
  const doneMsg = await tryTaskCompletion(raw);
  if (doneMsg) return doneMsg;

  // ── Task add (natural phrasing) ─ "to" is required to reject past-tense phrases ──
  const taskLead = raw.trim().match(/\b(?:i\s+)?(?:need|have|remind\s+me|remember|got|gotta)\s+to\s+(.+?)[.!?]?$/i)
                || raw.trim().match(/^(?:todo|task):\s+(.+?)[.!?]?$/i);
  if (taskLead) {
    const chunks = taskLead[1]!.split(/\s+and\s+/i).map(c => c.trim()).filter(Boolean);
    const created: string[] = [];
    for (const chunk of chunks) {
      let title = chunk;
      let due: string | undefined;
      const words = title.split(/\s+/);
      // trailing date word
      const lastLow = words[words.length - 1]?.toLowerCase().replace(/[.,!?]/g, "");
      if (lastLow) {
        const d = dateFromWord(lastLow);
        if (d) { due = d; words.pop(); }
      }
      title = words.join(" ").replace(/[.,!?]$/, "").trim();
      if (!title) continue;
      run("INSERT INTO tasks(title,notes,priority,due_date,created_at) VALUES(?,?,?,?,?)",
          title, null, 2, due ?? null, now());
      if (due) await syncDay(due);
      created.push(due ? `${title} (due ${due})` : title);
    }
    if (created.length) return `Task${created.length > 1 ? "s" : ""} added:\n• ${created.join("\n• ")}`;
  }

  // Normalize: drop pronouns / fillers so `mood`, `spent`, etc. surface easily.
  const s = raw.trim()
    .replace(/\b(?:my|the|for|today|now|is|please|it|to|on|a|an|i|ive|i've|just|been|am|working)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Retroactive time: "worked <label> [for] <n> minutes|hours"  or  "spent <n> min/hr on <label>"
  // Placed BEFORE money-spent regex so "spent 30 minutes on vitex" isn't logged as $30.
  let mm: RegExpMatchArray | null;

  // Activity-style: "went out for a walk for 15 min", "had a run for 30 min", "took a nap for 20 min"
  mm = raw.match(/\b(?:went|had|took)\s+(?:out\s+)?(?:for\s+)?(?:a\s+|an\s+|the\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+for\s+(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]! * 60);
  mm = raw.match(/\b(?:went|had|took)\s+(?:out\s+)?(?:for\s+)?(?:a\s+|an\s+|the\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+for\s+(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]! * 3600);
  mm = raw.match(/\b(?:went|had|took)\s+(?:out\s+)?(?:for\s+)?(?:a\s+|an\s+|the\s+)?([a-z][\w-]*(?:\s+[a-z][\w-]*)?)\s+for\s+(\d+(?:\.\d+)?)\s*(?:secs?|seconds?)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]!);

  // Explicit money verbs first (with symbol/currency prefix optional)
  // "drank coffee for ₹20", "bought a book for 300", "ordered pizza for 500"
  mm = raw.match(/\b(?:drank|ate|ordered|watched|paid\s+for)\s+(?:a\s+|an\s+|the\s+|some\s+)?(.+?)\s+for\s+(?:[₹$€£]|rs\.?\s*|inr\s+)?(\d+(?:\.\d+)?)/i);
  if (mm) return await logExpense(mm[1]!.trim().toLowerCase(), +mm[2]!);

  mm = s.match(/\b(?:worked|did|put)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]! * 60);
  mm = s.match(/\b(?:worked|did|put)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]! * 3600);
  mm = s.match(/\b(?:worked|did|put)\s+(.+?)\s+(\d+(?:\.\d+)?)\s*(?:secs?|seconds?)\b/i);
  if (mm) return await logRetroSession(mm[1]!.trim(), +mm[2]!);
  mm = s.match(/\bspent\s+(\d+(?:\.\d+)?)\s*(?:mins?|minutes?|m)\b\s*(.+)/i);
  if (mm) return await logRetroSession(mm[2]!.trim(), +mm[1]! * 60);
  mm = s.match(/\bspent\s+(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)\b\s*(.+)/i);
  if (mm) return await logRetroSession(mm[2]!.trim(), +mm[1]! * 3600);
  mm = s.match(/\bspent\s+(\d+(?:\.\d+)?)\s*(?:secs?|seconds?)\b\s*(.+)/i);
  if (mm) return await logRetroSession(mm[2]!.trim(), +mm[1]!);

  // mood [valence] [energy] [tag]  — anywhere in the message
  mm = s.match(/\bmood\s+(\d{1,2})(?:\s+(\d{1,2}))?(?:\s+(\S+))?/i);
  if (mm) {
    const valence = clamp(+mm[1]!, 1, 10);
    const energy  = mm[2] ? clamp(+mm[2]!, 1, 10) : 5;
    run("INSERT INTO mood2d(ts,energy,valence,tag,note) VALUES(?,?,?,?,?)", now(), energy, valence, mm[3] ?? null, null);
    await syncDay(today());
    return `Logged mood ${valence}/10 (energy ${energy}/10)${mm[3] ? ` · ${mm[3]}` : ""}.`;
  }

  // spent/paid <amount> <category> [note]
  mm = s.match(/\b(?:spent|spend|spending|paid|paying|expense|bought|buy)\s+(\d+(?:\.\d+)?)\s+(\S+)(?:\s+(.+))?/i);
  if (mm) {
    run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
        now(), +mm[1]!, mm[2]!.toLowerCase(), mm[3] ?? null, "expense");
    await syncDay(today());
    return `Logged expense ${mm[1]} on ${mm[2]}.`;
  }

  // earned <amount> <source>
  mm = s.match(/\b(?:earned|earn|income|got|received)\s+(\d+(?:\.\d+)?)\s+(\S+)(?:\s+(.+))?/i);
  if (mm) {
    run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
        now(), +mm[1]!, mm[2]!.toLowerCase(), mm[3] ?? null, "income");
    await syncDay(today());
    return `Logged income ${mm[1]} from ${mm[2]}.`;
  }

  // weight NN.N
  mm = s.match(/\b(?:weight|kg)\s+(\d+(?:\.\d+)?)/i);
  if (mm) {
    const day = today();
    run(`INSERT INTO weight(day,kg,note,updated_at) VALUES(?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET kg=excluded.kg, updated_at=excluded.updated_at`,
        day, +mm[1]!, null, now());
    await syncDay(day);
    return `Logged weight ${mm[1]} kg.`;
  }

  // meal <name...> <kcal>
  mm = s.match(/\b(?:meal|ate|had)\s+(.+?)\s+(\d+)\s*(?:kcal|cal)?$/i);
  if (mm) {
    run("INSERT INTO meals(ts,name,kcal,protein_g,carbs_g,fat_g,note) VALUES(?,?,?,?,?,?,?)",
        now(), mm[1]!.trim(), +mm[2]!, null, null, null, null);
    await syncDay(today());
    return `Logged ${mm[1]} · ${mm[2]} kcal.`;
  }

  // sleep HH:MM HH:MM [quality]
  mm = s.match(/\bsleep\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}))?/i);
  if (mm) {
    const day = today();
    const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h! * 60 + m!; };
    let d = toMin(mm[2]!) - toMin(mm[1]!); if (d < 0) d += 24 * 60;
    const hours = Math.round((d / 60) * 10) / 10;
    run(`INSERT INTO sleep(day,bedtime,waketime,hours,quality,note,updated_at) VALUES(?,?,?,?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET bedtime=excluded.bedtime,waketime=excluded.waketime,hours=excluded.hours,quality=COALESCE(excluded.quality,sleep.quality),updated_at=excluded.updated_at`,
        day, mm[1]!, mm[2]!, hours, mm[3] ? +mm[3]! : null, null, now());
    await syncDay(day);
    return `Logged sleep ${hours}h${mm[3] ? ` · quality ${mm[3]}/10` : ""}.`;
  }

  // win/grateful <text>
  mm = s.match(/\bwin\s+(.+)/i);
  if (mm) {
    const day = today();
    run("INSERT INTO wins(day,ts,text) VALUES(?,?,?)", day, now(), mm[1]!);
    await syncDay(day);
    return `Win logged ✨`;
  }
  mm = s.match(/\b(?:grateful|gratitude|thanks)\s+(.+)/i);
  if (mm) {
    const day = today();
    run("INSERT INTO gratitudes(day,ts,text) VALUES(?,?,?)", day, now(), mm[1]!);
    await syncDay(day);
    return `Gratitude logged 🙏`;
  }

  // start / stop time session
  mm = s.match(/\b(?:start|started|starting|begin|began)\s+(.+)/i);
  if (mm) {
    const label = mm[1]!.replace(/\.$/, "").trim().toLowerCase();
    if (label) {
      const active = q1<{ label: string; started_at: string }>(
        "SELECT label, started_at FROM time_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1");
      if (active && active.label.toLowerCase() === label) {
        const mins = Math.floor((Date.now() - new Date(active.started_at).getTime()) / 60000);
        return `Already tracking ${active.label} · ${mins} min so far.`;
      }
      run("UPDATE time_sessions SET ended_at=? WHERE ended_at IS NULL", now());
      run("INSERT INTO time_sessions(label,category,started_at) VALUES(?,?,?)", label, inferCategory(label), now());
      return active
        ? `Switched from "${active.label}" → "${label}". Timer started.`
        : `Timer started · ${label}`;
    }
  }
  if (/\b(?:stop|stopped|done|finished|ended)\b/i.test(s)) {
    const active = q1<{ id: number; label: string }>("SELECT id, label FROM time_sessions WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1");
    if (active) {
      run("UPDATE time_sessions SET ended_at=? WHERE ended_at IS NULL", now());
      await syncDay(today());
      return `Stopped · ${active.label}`;
    }
    return `No active timer to stop.`;
  }

  return null;
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }

function dateFromWord(w: string): string | undefined {
  const t = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  if (w === "today") return fmt(t);
  if (w === "tomorrow" || w === "tmrw" || w === "tmr") { t.setDate(t.getDate() + 1); return fmt(t); }
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const idx = days.indexOf(w);
  if (idx >= 0) { let add = (idx - t.getDay() + 7) % 7; if (add === 0) add = 7; t.setDate(t.getDate() + add); return fmt(t); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  return undefined;
}

// ── Task completion: fuzzy-match user's "done X" against open tasks ──────────────────────
const TASK_STOPWORDS = new Set([
  "i","im","ive","my","me","the","a","an","to","for","on","of","in","at",
  "and","or","but","is","am","are","was","be","been","have","had","has",
  "already","just","now","today","yesterday","finally","all","as","well",
  "done","finished","completed","applied","submitted","handled","did",
  "got","getting","paid","sent","filed","renewed","called","bought","wrote",
]);

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/\W+/).filter(w => w.length >= 3 && !TASK_STOPWORDS.has(w));
}

/** Two words match if identical, or one is a 4+ char prefix of the other (`wash` ↔ `washed`). */
function strongTokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

async function tryTaskCompletion(raw: string): Promise<string | null> {
  const lower = raw.toLowerCase();
  const looksLikeCompletion =
    /\b(?:done|finished|completed|submitted|handled)\b/.test(lower) ||
    /\b(?:i|i'?ve|just)\s*(?:have|already)?\s*(?:did|done|applied|paid|sent|filed|renewed|called|bought|got|wrote|shipped|finished|completed|submitted|handled|picked)\b/.test(lower);
  if (!looksLikeCompletion) return null;

  const openTasks = q<{ id: number; title: string; due_date: string | null }>("SELECT id, title, due_date FROM tasks WHERE done=0 ORDER BY id ASC");
  if (openTasks.length === 0) return null;

  // Split into event chunks so "done X, and applied Y" closes both.
  const chunks = raw.split(/\s+and\s+|\s*[,;]\s*/i).map(c => c.trim()).filter(Boolean);
  const closed = new Set<number>();
  const closedTitles: string[] = [];

  for (const chunk of chunks) {
    const chunkTokens = tokenize(chunk);
    if (chunkTokens.length === 0) continue;
    let best: { id: number; title: string; score: number } | null = null;
    for (const t of openTasks) {
      if (closed.has(t.id)) continue;
      const titleTokens = tokenize(t.title);
      if (titleTokens.length === 0) continue;
      const hits = titleTokens.filter(tt => chunkTokens.some(ct => strongTokenMatch(ct, tt))).length;
      const ratio = hits / titleTokens.length;
      if (hits < 1 || ratio < 0.5) continue;
      // Score: absolute hits dominate; ratio breaks ties; explicit due-date is +1 (real user tasks).
      const score = hits + ratio * 0.3 + (t.due_date ? 1 : 0);
      if (!best || score > best.score) best = { id: t.id, title: t.title, score };
    }
    if (best) { closed.add(best.id); closedTitles.push(best.title); }
  }

  if (closedTitles.length === 0) return null;
  for (const id of closed) run("UPDATE tasks SET done=1, done_at=? WHERE id=?", now(), id);
  await syncDay(today());
  return `Marked done ✓\n• ${closedTitles.join("\n• ")}`;
}

async function logRetroSession(label: string, seconds: number): Promise<string> {
  label = label.trim().toLowerCase();
  const category = inferCategory(label);
  const end = new Date();
  const start = new Date(end.getTime() - seconds * 1000);
  run("UPDATE time_sessions SET ended_at=? WHERE ended_at IS NULL", now());
  run("INSERT INTO time_sessions(label,category,started_at,ended_at) VALUES(?,?,?,?)",
      label, category, start.toISOString(), end.toISOString());
  await syncDay(today());
  const mins = Math.round(seconds / 60);
  const hrs  = seconds / 3600;
  const dur  = hrs >= 1 ? `${hrs.toFixed(hrs >= 10 ? 0 : 1)}h` : `${mins}m`;
  return `Logged ${dur} on ${label}.`;
}

function inferCategory(label: string): string {
  const l = label.toLowerCase();
  if (/\b(?:walk|run|gym|exercise|workout|nap|meditate|yoga|stretch|swim|bike|cycle|hike|jog)\b/.test(l)) return "wellbeing";
  if (/\b(?:read|study|learn|course|book|practice)\b/.test(l)) return "learning";
  if (/\b(?:cook|clean|chore|laundry|shop|errand)\b/.test(l)) return "chores";
  if (/\b(?:call|meet|coffee|dinner|hangout|social|date)\b/.test(l)) return "personal";
  return "work";
}

async function logExpense(category: string, amount: number): Promise<string> {
  category = category.replace(/^(?:a|an|the|some)\s+/, "").trim();
  run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
      now(), amount, category, null, "expense");
  await syncDay(today());
  return `Logged expense ${amount} on ${category}.`;
}

// ── calendar (month overview) ─────────────────────────────────────────────
app.get("/calendar/:month", (c) => {
  const m = c.req.param("month"); // YYYY-MM
  const [y, mo] = m.split("-").map(Number);
  const first = new Date(Date.UTC(y!, mo! - 1, 1)).toISOString().slice(0, 10);
  const next  = new Date(Date.UTC(y!, mo!, 1)).toISOString().slice(0, 10);
  return c.json(q(
    "SELECT day, substr(content,1,120) AS preview FROM journals WHERE day>=? AND day<? ORDER BY day",
    first, next));
});

// ── weight ─────────────────────────────────────────────────────────────────────────────────────────
app.get("/weight", (c) => {
  const days = Number(c.req.query("days") ?? 90);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return c.json(q("SELECT * FROM weight WHERE day>=? ORDER BY day", since));
});
app.post("/weight",
  zValidator("json", z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    kg:  z.number().positive(),
    note: z.string().optional(),
  })),
  async (c) => {
    const b = c.req.valid("json");
    const day = b.day ?? today();
    run(`INSERT INTO weight(day,kg,note,updated_at) VALUES(?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET kg=excluded.kg, note=excluded.note, updated_at=excluded.updated_at`,
        day, b.kg, b.note ?? null, now());
    await syncDay(day);
    return c.json({ ok: true });
  });
app.delete("/weight/:day", async (c) => {
  const day = c.req.param("day");
  run("DELETE FROM weight WHERE day=?", day);
  await syncDay(day);
  return c.json({ ok: true });
});

// ── meals / calories ─────────────────────────────────────────────────────────────
app.get("/meals", (c) => {
  const day = c.req.query("day") ?? today();
  return c.json(q("SELECT * FROM meals WHERE date(ts, 'localtime')=? ORDER BY ts", day));
});
app.get("/meals/daily", (c) => {
  const days = Number(c.req.query("days") ?? 30);
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return c.json(q(
    "SELECT date(ts, 'localtime') d, SUM(kcal) kcal, SUM(protein_g) p, SUM(carbs_g) c, SUM(fat_g) f " +
    "FROM meals WHERE date(ts, 'localtime')>=? GROUP BY d ORDER BY d", since));
});
app.post("/meals",
  zValidator("json", z.object({
    name: z.string().min(1),
    kcal: z.number().int().nonnegative(),
    protein_g: z.number().nonnegative().optional(),
    carbs_g:   z.number().nonnegative().optional(),
    fat_g:     z.number().nonnegative().optional(),
    note: z.string().optional(),
  })),
  async (c) => {
    const m = c.req.valid("json");
    run("INSERT INTO meals(ts,name,kcal,protein_g,carbs_g,fat_g,note) VALUES(?,?,?,?,?,?,?)",
        now(), m.name, m.kcal, m.protein_g ?? null, m.carbs_g ?? null, m.fat_g ?? null, m.note ?? null);
    await syncDay(today());
    return c.json({ ok: true });
  });
app.delete("/meals/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const row = q1<{ ts: string }>("SELECT ts FROM meals WHERE id=?", id);
  run("DELETE FROM meals WHERE id=?", id);
  if (row) await syncDay(row.ts.slice(0, 10));
  return c.json({ ok: true });
});

// ── investments (Yahoo Finance for prices — free, no key) ─────────────────────────────────────────────────────
// Symbol autocomplete: presets (EPF/PPF/NPS/...) + Yahoo stocks/ETFs/crypto + AMFI MFs.
app.get("/holdings/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim();
  if (q.length < 1) return c.json([]);
  const qLo = q.toLowerCase();

  const PRESETS: { symbol: string; name: string; kind: "debt"; currency: "INR" }[] = [
    { symbol: "EPF",  name: "Employees' Provident Fund",        kind: "debt", currency: "INR" },
    { symbol: "PPF",  name: "Public Provident Fund",           kind: "debt", currency: "INR" },
    { symbol: "NPS",  name: "National Pension System",         kind: "debt", currency: "INR" },
    { symbol: "VPF",  name: "Voluntary Provident Fund",        kind: "debt", currency: "INR" },
    { symbol: "FD",   name: "Fixed Deposit (bank)",            kind: "debt", currency: "INR" },
    { symbol: "RD",   name: "Recurring Deposit (bank)",        kind: "debt", currency: "INR" },
    { symbol: "SSY",  name: "Sukanya Samriddhi Yojana",        kind: "debt", currency: "INR" },
    { symbol: "KVP",  name: "Kisan Vikas Patra",               kind: "debt", currency: "INR" },
    { symbol: "NSC",  name: "National Savings Certificate",    kind: "debt", currency: "INR" },
    { symbol: "SCSS", name: "Senior Citizens Savings Scheme",  kind: "debt", currency: "INR" },
    { symbol: "SGB",  name: "Sovereign Gold Bond",             kind: "debt", currency: "INR" },
    { symbol: "POMIS",name: "Post Office Monthly Income Scheme",kind: "debt", currency: "INR" },
  ];

  const suggestions: any[] = [];

  // 1. Presets — instant
  for (const p of PRESETS) {
    if (p.symbol.toLowerCase().includes(qLo) || p.name.toLowerCase().includes(qLo)) {
      suggestions.push({ ...p, source: "preset" });
    }
  }

  // 2. Yahoo search (stocks / ETFs / crypto)
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0 LifeOS", Accept: "application/json" }, signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      const j = await r.json() as any;
      for (const yq of (j?.quotes ?? []).slice(0, 8)) {
        if (typeof yq?.symbol !== "string") continue;
        const qtype = String(yq.quoteType ?? "").toUpperCase();
        const kind = qtype === "CRYPTOCURRENCY" ? "crypto" :
                     qtype === "ETF"           ? "etf"    :
                     qtype === "MUTUALFUND"    ? "mf"     : "stock";
        suggestions.push({
          symbol: yq.symbol,
          name: yq.longname || yq.shortname || yq.symbol,
          kind,
          currency: yq.symbol.endsWith(".NS") || yq.symbol.endsWith(".BO") ? "INR" : "USD",
          exchange: yq.exchDisp,
          source: "yahoo",
        });
      }
    }
  } catch {}

  // 3. AMFI MFs (top 5 fuzzy matches)
  if (q.length >= 3) {
    const amfi = await loadAmfi();
    if (amfi) {
      const qTokens = qLo.split(/\W+/).filter(Boolean);
      const scored: { s: any; score: number }[] = [];
      for (const s of amfi) {
        const nameLo = s.name.toLowerCase();
        const hits = qTokens.filter(t => nameLo.includes(t)).length;
        if (hits === qTokens.length) scored.push({ s, score: hits + (nameLo.startsWith(qLo) ? 0.5 : 0) });
      }
      scored.sort((a, b) => b.score - a.score);
      for (const { s } of scored.slice(0, 5)) {
        suggestions.push({ symbol: s.name, name: s.name, kind: "mf", currency: "INR", nav: s.nav, source: "amfi" });
      }
    }
  }

  return c.json(suggestions.slice(0, 20));
});

// Deterministic allocation-vs-target snapshot for the visual gauge on /invest.
app.get("/holdings/allocation", async (c) => {
  const holdings = q<any>("SELECT * FROM holdings");
  const profile = q1<any>("SELECT * FROM profile WHERE id=1");
  const age = profile?.dob ? Math.max(0, Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 864e5))) : null;
  const targetCcy = profile?.currency || "USD";
  const rates = await getFXRates();

  const classify = (h: any): string => {
    const s = `${h.symbol} ${h.note ?? ""}`.toLowerCase();
    if (h.kind === "crypto") return "crypto";
    // EPF/PPF/NPS/VPF and other govt/retirement schemes get their own bucket
    if (/\b(epf|epfo|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis|sgb)\b/.test(s)) return "retirement";
    if (h.kind === "debt") return "debt";
    if (/\bgold(bees|ietf|shar)?\b/.test(s)) return "gold";
    if (/\bsilver(bees|ietf)?\b/.test(s)) return "silver";
    if (/\b(debt|bond|gilt|liquid|income|overnight|corporate|epf|epfo|ppf|nps|provident|gsec|fd|rd)\b/.test(s)) return "debt";
    if (h.currency !== "INR") return "us_equity";
    return "indian_equity";
  };

  const totals: Record<string, number> = { indian_equity: 0, us_equity: 0, debt: 0, retirement: 0, gold: 0, silver: 0, crypto: 0 };
  for (const h of holdings) {
    const cat = classify(h);
    const nativeValue = (h.manual_price ?? h.cost_basis) * h.shares;
    const inTargetCcy = rates ? convert(nativeValue, h.currency, targetCcy, rates) : nativeValue;
    totals[cat] = (totals[cat] ?? 0) + inTargetCcy;
  }
  const totalValue = Object.values(totals).reduce((a, b) => a + b, 0);

  const a = age ?? 30;
  const equityTotal = Math.max(30, Math.min(80, 100 - a));
  const usLo = 10, usHi = 20, goldLo = 5, goldHi = 10, silverLo = 0, silverHi = 5, cryptoLo = 0, cryptoHi = 5;
  const retireLo = 10, retireHi = 20;    // EPF+PPF+NPS typical for a working professional
  const debtLo = Math.max(5, 100 - equityTotal - usHi - retireHi - goldHi - silverHi - cryptoHi);
  const debtHi = debtLo + 10;
  const indianEqLo = Math.max(20, equityTotal - usHi);
  const indianEqHi = Math.max(indianEqLo + 5, equityTotal - usLo);

  const catalogue: [string, string, number, number][] = [
    ["indian_equity", "Indian equity",       indianEqLo, indianEqHi],
    ["us_equity",     "International (US)",  usLo,       usHi],
    ["retirement",    "Retirement (EPF/PPF/NPS)", retireLo, retireHi],
    ["debt",          "Debt / fixed income", debtLo,     debtHi],
    ["gold",          "Gold",                goldLo,     goldHi],
    ["silver",        "Silver",              silverLo,   silverHi],
    ["crypto",        "Crypto",              cryptoLo,   cryptoHi],
  ];

  const rows = catalogue.map(([key, label, tLo, tHi]) => {
    const value = totals[key] ?? 0;
    const pct = totalValue > 0 ? (value / totalValue) * 100 : 0;
    let status: "ok" | "low" | "high" | "empty";
    if (pct === 0)      status = "empty";
    else if (pct < tLo) status = "low";
    else if (pct > tHi) status = "high";
    else                status = "ok";
    const targetMid = (tLo + tHi) / 2;
    const gapAmount = totalValue > 0 ? Math.round((targetMid / 100 - value / totalValue) * totalValue) : 0;
    return { key, label, value: Math.round(value), pct: Math.round(pct * 10) / 10,
             target_lo: tLo, target_hi: tHi, gap_amount: gapAmount, status };
  });

  return c.json({ total_value: Math.round(totalValue), currency: targetCcy, age, rows });
});

// Interactive follow-up. Body: { messages: [{role,content}, ...] }
app.post("/holdings/advisor", async (c) => {
  const cfg = getConfig();
  if (!cfg) return c.json({ error: "LLM not configured. Set one up in Settings." }, 400);
  const { messages = [] } = await c.req.json();
  if (!Array.isArray(messages) || messages.length === 0) return c.json({ error: "empty" }, 400);

  const holdings = q<any>("SELECT * FROM holdings");
  const classify = (h: any): string => {
    const s = `${h.symbol} ${h.note ?? ""}`.toLowerCase();
    if (h.kind === "crypto") return "crypto";
    // EPF/PPF/NPS/VPF and other govt/retirement schemes get their own bucket
    if (/\b(epf|epfo|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis|sgb)\b/.test(s)) return "retirement";
    if (h.kind === "debt") return "debt";
    if (/\bgold(bees|ietf|shar)?\b/.test(s)) return "gold";
    if (/\bsilver(bees|ietf)?\b/.test(s)) return "silver";
    if (/\b(debt|bond|gilt|liquid|income|overnight|corporate|epf|epfo|ppf|nps|provident|gsec|fd|rd)\b/.test(s)) return "debt";
    if (h.currency !== "INR") return "us_equity";
    return "indian_equity";
  };
  const totals: Record<string, { value: number; native: string }> = {};
  for (const h of holdings) {
    const cls = classify(h);
    const value = (h.manual_price ?? h.cost_basis) * h.shares;
    if (!totals[cls]) totals[cls] = { value: 0, native: h.currency };
    totals[cls]!.value += value;
  }
  const profile = q1<any>("SELECT * FROM profile WHERE id=1");
  const age = profile?.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 864e5)) : null;

  const followupPrompt = `You are the Indian financial advisor from earlier. The user is ${profile?.name ?? "user"}${age != null ? `, age ${age}` : ""}. Answer their follow-up briefly (< 200 words). Use ₹. Reference real holdings when relevant. No stock tips — allocation gaps and concrete rupee amounts only.

PORTFOLIO SNAPSHOT:
${JSON.stringify({ profile: { name: profile?.name, age, currency: profile?.currency ?? "INR", goal: profile?.goal, values: profile?.values_json }, allocation: totals, total_positions: holdings.length })}`;

  try {
    const reply = await callChat(cfg, [
      { role: "system", content: followupPrompt },
      ...messages,
    ]);
    return c.json({ answer: reply });
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 500);
  }
});

// LLM investment advice tailored to Indian personal finance.
let adviceCache: { at: number; advice: string } | null = null;
app.post("/holdings/advice", async (c) => {
  const cfg = getConfig();
  if (!cfg) return c.json({ error: "LLM not configured. Set one up in Settings." }, 400);
  const body = await c.req.json().catch(() => ({}));
  if (!body.force && adviceCache && Date.now() - adviceCache.at < 6 * 3600_000) {
    return c.json({ advice: adviceCache.advice, cached: true });
  }

  const holdings = q<any>("SELECT * FROM holdings");
  if (holdings.length === 0) return c.json({ advice: "Import your Groww or Ind Money file first — no positions to analyze." });

  const classify = (h: any): string => {
    const s = `${h.symbol} ${h.note ?? ""}`.toLowerCase();
    if (h.kind === "crypto") return "crypto";
    // EPF/PPF/NPS/VPF and other govt/retirement schemes get their own bucket
    if (/\b(epf|epfo|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis|sgb)\b/.test(s)) return "retirement";
    if (h.kind === "debt") return "debt";
    if (/\bgold(bees|ietf|shar)?\b/.test(s)) return "gold";
    if (/\bsilver(bees|ietf)?\b/.test(s)) return "silver";
    if (/\b(debt|bond|gilt|liquid|income|overnight|corporate|epf|epfo|ppf|nps|provident|gsec|fd|rd)\b/.test(s)) return "debt";
    if (h.currency !== "INR") return "us_equity";
    return "indian_equity";
  };
  const totals: Record<string, { value: number; native: string }> = {};
  for (const h of holdings) {
    const cls = classify(h);
    const value = (h.manual_price ?? h.cost_basis) * h.shares;
    if (!totals[cls]) totals[cls] = { value: 0, native: h.currency };
    totals[cls]!.value += value;
  }
  const top = [...holdings].sort((a, b) =>
    (b.manual_price ?? b.cost_basis) * b.shares - (a.manual_price ?? a.cost_basis) * a.shares).slice(0, 5);

  const profile = q1<any>("SELECT * FROM profile WHERE id=1");
  const age = profile?.dob ? Math.floor((Date.now() - new Date(profile.dob).getTime()) / (365.25 * 864e5)) : null;

  const snapshot = {
    profile: {
      name: profile?.name ?? "user",
      age, currency: profile?.currency ?? "INR",
      values: profile?.values_json ?? null,
      goal: profile?.goal ?? null,
    },
    allocation: totals,
    top_positions: top.map(h => ({
      symbol: h.symbol, kind: h.kind, currency: h.currency,
      shares: h.shares, cost_basis: h.cost_basis, note: h.note,
    })),
    total_positions: holdings.length,
    imported_from: [...new Set(holdings.map(h => h.imported_from))].filter(Boolean),
  };

  const systemPrompt = `You are a warm, plainspoken Indian personal-finance advisor speaking to \`\${profile.name}\`. The PORTFOLIO SNAPSHOT contains their exact age; USE it.

The UI already renders a visual allocation-vs-target gauge under your message, so DO NOT output any table or gap chart yourself. Focus on the human explanation.

=== ALLOCATION TARGETS (Indian, adjust by age: equity% = 100 - age) ===
  Equity : Indian large-cap 30–35%, mid 10–15%, small 5–10%, international (US) 10–20%
  Debt   : max(15, N – 20)% — liquid MF, EPF, PPF, gilt
  Gold 5–10% · Silver 0–5% · REITs 0–5% · Crypto 0–5%

=== RULES ===
R1. Emergency fund of 6 months' expenses in liquid MF BEFORE equity concentration — if missing, action #1.
R2. Flag concentration risk (single position > 10% or two funds in same category).
R3. Indian tax: 80C (₹1.5L), 80CCD(1B) NPS (₹50k extra), 80D health; LTCG 12.5% > ₹1.25L; STCG 20%.
R4. Praise Direct plans if the user is using them.
R5. NEVER give stock tips — categories and ratios only.
R6. FORMAT with markdown headings in exactly this order, NO tables:

### Snapshot
One line summarizing total value and overall aggressiveness.

### What's working
- three concise bullets with concrete numbers

### What to fix
- three concise bullets, each citing the actual ₹ gap

### This month's moves
1. concrete SIP or lump-sum amount in ₹
2. concrete step

### Note
One-line disclaimer.

R7. Under 250 words. Use ₹. Warm, direct, honest. No fabricated numbers.`;

  try {
    const reply = await callChat(cfg, [
      { role: "system", content: systemPrompt },
      { role: "user",   content: `PORTFOLIO SNAPSHOT:\n${JSON.stringify(snapshot, null, 2)}` },
    ]);
    adviceCache = { at: Date.now(), advice: reply };
    return c.json({ advice: reply, cached: false });
  } catch (e: any) {
    return c.json({ error: String(e?.message ?? e) }, 500);
  }
});

// Resolve Groww-style names ("ADITYA INFOTECH") to real Yahoo tickers ("CPPLUS.NS").
app.post("/holdings/resolve", async (c) => {
  const unresolved = q<any>(
    "SELECT id, symbol, note, imported_from FROM holdings WHERE kind IN ('stock','etf') AND symbol NOT LIKE '%.NS' AND symbol NOT LIKE '%.BO' AND symbol NOT LIKE '%.%'"
  );
  let resolved = 0;
  for (const h of unresolved) {
    const fullName = h.note?.match(/Groww · ([^·]+)/)?.[1]?.trim() || h.symbol;
    const ticker = await yahooSearch(fullName);
    if (ticker) { run("UPDATE holdings SET symbol=? WHERE id=?", ticker, h.id); resolved++; }
    await new Promise(r => setTimeout(r, 150));
  }
  return c.json({ tried: unresolved.length, resolved });
});

async function yahooSearch(query: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`,
      { headers: { "User-Agent": "Mozilla/5.0 LifeOS", Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json() as any;
    const quotes = j?.quotes ?? [];
    const pick =
      quotes.find((q: any) => typeof q.symbol === "string" && q.symbol.endsWith(".NS")) ??
      quotes.find((q: any) => typeof q.symbol === "string" && q.symbol.endsWith(".BO")) ??
      quotes.find((q: any) => q?.quoteType === "EQUITY") ??
      quotes[0];
    return pick?.symbol ?? null;
  } catch { return null; }
}

app.get("/holdings", async (c) => {
  applyMonthlyContributions();          // catch up missed months before we read
  const holdings = q<any>("SELECT * FROM holdings ORDER BY symbol");
  if (holdings.length === 0) return c.json({ holdings: [], total: 0, cost: 0, gain: 0, grand: null });

  const uniqueSymbols = [...new Set(holdings.map(h => h.symbol))];
  // Yahoo for equity/crypto; AMFI for Indian mutual funds.
  const yahooTargets = holdings.filter(h => h.kind !== "mf").map(h => h.symbol);
  const mfHoldings   = holdings.filter(h => h.kind === "mf");

  const yahooEntries = await Promise.all([...new Set(yahooTargets)].map(async (sym): Promise<[string, { price: number; currency: string } | null]> => {
    try {
      const r = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0 LifeOS" }, signal: AbortSignal.timeout(5000) });
      if (!r.ok) return [sym, null];
      const j = await r.json() as any;
      const meta = j?.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) return [sym, null];
      return [sym, { price: meta.regularMarketPrice, currency: meta.currency ?? "USD" }];
    } catch { return [sym, null]; }
  }));
  const prices: Record<string, { price: number; currency: string }> = {};
  for (const [sym, p] of yahooEntries) if (p) prices[sym] = p;

  // AMFI NAV lookup for MFs (India-only).
  const amfi = mfHoldings.length ? await loadAmfi() : null;
  if (amfi) {
    for (const h of mfHoldings) {
      const scheme = findAmfiScheme(amfi, h.symbol) || (h.note && findAmfiScheme(amfi, h.note));
      if (scheme) prices[h.symbol] = { price: scheme.nav, currency: "INR" };
    }
  }

  const enriched = holdings.map(h => {
    const yahoo = prices[h.symbol];
    const price = yahoo?.price || h.manual_price || h.cost_basis;
    const value = price * h.shares;
    const cost  = h.cost_basis * h.shares;
    return {
      ...h,
      price, value, cost,
      gain: value - cost,
      gain_pct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      quote_currency: yahoo?.currency ?? h.currency,
      price_source: yahoo ? (h.kind === "mf" ? "amfi" : "live") : (h.manual_price ? "report" : "cost"),
    };
  });
  const total = enriched.reduce((s, x) => s + x.value, 0);
  const cost  = enriched.reduce((s, x) => s + x.cost,  0);

  // Grand total converted to profile currency
  const profile = q1<{ currency: string | null }>("SELECT currency FROM profile WHERE id=1");
  const targetCcy = profile?.currency || "USD";
  const rates = await getFXRates();
  const grand = rates
    ? {
        currency: targetCcy,
        value: enriched.reduce((s, h) => s + convert(h.value, h.currency, targetCcy, rates), 0),
        cost:  enriched.reduce((s, h) => s + convert(h.cost,  h.currency, targetCcy, rates), 0),
      }
    : null;

  return c.json({
    holdings: enriched, total, cost, gain: total - cost,
    grand: grand ? { ...grand, gain: grand.value - grand.cost, pct: grand.cost > 0 ? ((grand.value - grand.cost) / grand.cost) * 100 : 0 } : null,
    fx_ok: !!rates,
  });
});

// ── FX rate cache (open.er-api.com, no key) ──────────────────────────────────────
// Apply missed monthly contributions lazily whenever /holdings is read.
function applyMonthlyContributions() {
  const nowMonth = now().slice(0, 7);
  const rows = q<any>("SELECT * FROM holdings WHERE monthly_contribution > 0");
  for (const r of rows) {
    const last = r.contribution_last_applied ?? nowMonth;
    const months = monthsBetween(last, nowMonth);
    if (months <= 0) continue;
    const contrib = r.monthly_contribution * months;

    // Balance-style (EPF/PPF/NPS/VPF): shares stays 1, bump balance directly.
    const isBalanceStyle = r.shares <= 1.0001 &&
      (r.kind === "debt" || /\b(epf|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis)\b/i.test(r.symbol));

    if (isBalanceStyle) {
      const newCost   = r.cost_basis + contrib;
      const newManual = (r.manual_price ?? r.cost_basis) + contrib;
      run("UPDATE holdings SET cost_basis=?, manual_price=?, contribution_last_applied=? WHERE id=?",
          newCost, newManual, nowMonth, r.id);
    } else {
      // SIP-style (MF units, stock DCA): buy units at current NAV/price, recompute weighted-avg cost.
      const nav = r.manual_price || r.cost_basis || 1;
      const unitsBought = contrib / nav;
      const newShares = r.shares + unitsBought;
      const totalCost = r.shares * r.cost_basis + contrib;
      const newCostBasis = newShares > 0 ? totalCost / newShares : r.cost_basis;
      run("UPDATE holdings SET shares=?, cost_basis=?, contribution_last_applied=? WHERE id=?",
          newShares, newCostBasis, nowMonth, r.id);
    }
  }
}
function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  if (!fy || !fm || !ty || !tm) return 0;
  return Math.max(0, (ty - fy) * 12 + (tm - fm));
}

let fxCache: { rates: Record<string, number>; at: number } | null = null;
async function getFXRates(): Promise<Record<string, number> | null> {
  if (fxCache && Date.now() - fxCache.at < 3600_000) return fxCache.rates;
  try {
    const r = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json() as any;
    if (j.result !== "success" || !j.rates) return null;
    fxCache = { rates: j.rates, at: Date.now() };
    return j.rates;
  } catch { return null; }
}
function convert(amount: number, from: string, to: string, ratesUsd: Record<string, number>): number {
  if (from === to) return amount;
  const fromRate = ratesUsd[from];
  const toRate   = ratesUsd[to];
  if (!fromRate || !toRate) return amount;
  return amount * (toRate / fromRate);
}

// ── AMFI Indian MF NAV lookup ───────────────────────────────────────────────────
type AmfiScheme = { code: string; isin: string; name: string; nav: number; date: string };
let amfiCache: { schemes: AmfiScheme[]; at: number } | null = null;
const amfiLookup = new Map<string, AmfiScheme | null>();
const AMFI_STOP = new Set(["fund","plan","option","scheme","reinvestment","payout","the","of","and"]);

async function loadAmfi(): Promise<AmfiScheme[] | null> {
  if (amfiCache && Date.now() - amfiCache.at < 86400_000) return amfiCache.schemes;
  try {
    const r = await fetch("https://portal.amfiindia.com/spages/NAVAll.txt", { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const text = await r.text();
    const schemes: AmfiScheme[] = [];
    for (const line of text.split(/\r?\n/)) {
      const parts = line.split(";");
      if (parts.length !== 6) continue;
      const [code, isin, , name, nav, date] = parts;
      const navNum = parseFloat(nav ?? "");
      if (!Number.isFinite(navNum) || !name || name === "Scheme Name") continue;
      schemes.push({ code: code.trim(), isin: isin.trim(), name: name.trim(), nav: navNum, date: date ?? "" });
    }
    amfiCache = { schemes, at: Date.now() };
    amfiLookup.clear();
    return schemes;
  } catch { return null; }
}

function amfiTokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !AMFI_STOP.has(w));
}

function findAmfiScheme(schemes: AmfiScheme[], query: string): AmfiScheme | null {
  const key = query.slice(0, 100);
  if (amfiLookup.has(key)) return amfiLookup.get(key)!;
  const qTokens = amfiTokens(query);
  if (qTokens.length < 2) { amfiLookup.set(key, null); return null; }
  const qSet = new Set(qTokens);
  let best: { s: AmfiScheme; score: number } | null = null;
  for (const s of schemes) {
    const sTokens = amfiTokens(s.name);
    if (sTokens.length === 0) continue;
    const hits = sTokens.filter(t => qSet.has(t)).length;
    if (hits < Math.min(qTokens.length, 3)) continue;
    // Prefer schemes where most tokens match on BOTH sides.
    const ratioQ = hits / qTokens.length;
    const ratioS = hits / sTokens.length;
    if (ratioQ < 0.6) continue;
    const score = hits + ratioS;
    if (!best || score > best.score) best = { s, score };
  }
  amfiLookup.set(key, best?.s ?? null);
  return best?.s ?? null;
}

app.post("/holdings",
  zValidator("json", z.object({
    symbol: z.string().min(1),
    kind: z.enum(["stock", "etf", "crypto", "mf", "debt"]).default("stock"),
    shares: z.number().positive(),
    cost_basis: z.number().nonnegative(),
    currency: z.string().default("USD"),
    note: z.string().optional(),
    monthly_contribution: z.number().nonnegative().optional(),
  })),
  (c) => {
    const h = c.req.valid("json");
    const nowIso = now();
    const thisMonth = nowIso.slice(0, 7);   // YYYY-MM
    run("INSERT INTO holdings(symbol,kind,shares,cost_basis,currency,note,created_at,monthly_contribution,contribution_last_applied) VALUES(?,?,?,?,?,?,?,?,?)",
        h.symbol.toUpperCase(), h.kind, h.shares, h.cost_basis, h.currency, h.note ?? null, nowIso,
        h.monthly_contribution ?? 0, h.monthly_contribution ? thisMonth : null);
    return c.json({ ok: true });
  });

app.delete("/holdings/:id", (c) => {
  run("DELETE FROM holdings WHERE id=?", Number(c.req.param("id")));
  return c.json({ ok: true });
});

// Edit an existing holding — currently only monthly_contribution.
app.patch("/holdings/:id",
  zValidator("json", z.object({
    monthly_contribution: z.number().nonnegative().nullable().optional(),
  })),
  (c) => {
    const id = Number(c.req.param("id"));
    const b = c.req.valid("json");
    if (b.monthly_contribution !== undefined) {
      const nowMonth = now().slice(0, 7);
      run("UPDATE holdings SET monthly_contribution=?, contribution_last_applied=COALESCE(contribution_last_applied, ?) WHERE id=?",
          b.monthly_contribution ?? 0, nowMonth, id);
    }
    return c.json({ ok: true });
  });

// Broker report import (Groww Stocks / MF for now)
app.post("/holdings/import", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file") as File | null;
  if (!file) return c.json({ error: "file missing" }, 400);
  const replace = String(form.get("replace") ?? "") === "1";
  const buf = await file.arrayBuffer();
  let result;
  try { result = importBrokerFile(buf, file.name); }
  catch (e: any) { return c.json({ error: String(e?.message ?? e) }, 400); }

  if (replace) run("DELETE FROM holdings WHERE imported_from = ?", result.source);

  // Consolidation: if a MANUAL holding matches an imported symbol (exact or prefix),
  // copy its SIP settings across and delete the manual duplicate.
  const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
  const manuals = q<any>("SELECT id, symbol, monthly_contribution, contribution_last_applied FROM holdings WHERE imported_from IS NULL");

  function findManualMatch(importedSym: string): any | null {
    const impN = norm(importedSym);
    // 1) exact
    let m = manuals.find(x => x._matched !== true && norm(x.symbol) === impN);
    if (m) return m;
    // 2) manual name is a prefix of imported ("Motilal Oswal Midcap Fund" → "...Direct Growth")
    m = manuals.find(x => x._matched !== true && impN.startsWith(norm(x.symbol)) && norm(x.symbol).length >= 6);
    if (m) return m;
    // 3) or imported is a prefix of manual
    m = manuals.find(x => x._matched !== true && norm(x.symbol).startsWith(impN) && impN.length >= 6);
    return m ?? null;
  }

  let consolidated = 0;
  const preservedSips = new Map<string, { monthly: number; last: string | null }>();
  for (const h of result.holdings as NormHolding[]) {
    const dup = findManualMatch(h.symbol);
    if (dup) {
      dup._matched = true;
      if (dup.monthly_contribution && dup.monthly_contribution > 0) {
        preservedSips.set(h.symbol, { monthly: dup.monthly_contribution, last: dup.contribution_last_applied });
      }
      run("DELETE FROM holdings WHERE id=?", dup.id);
      consolidated++;
    }
  }

  for (const h of result.holdings as NormHolding[]) {
    const sip = preservedSips.get(h.symbol);
    run(`INSERT INTO holdings(symbol,kind,shares,cost_basis,currency,note,manual_price,imported_from,created_at,monthly_contribution,contribution_last_applied)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
      h.symbol, h.kind, h.shares, h.cost_basis, h.currency,
      h.note ?? null, h.manual_price ?? null, h.imported_from, now(),
      sip?.monthly ?? 0, sip?.last ?? null);
  }
  return c.json({ source: result.source, imported: result.imported, skipped: result.skipped, consolidated });
});

// ── LLM config ─────────────────────────────────────────────────────────────────────────
app.get("/llm/providers", (c) => {
  return c.json(Object.entries(PROVIDERS).map(([id, p]) => ({
    id, label: p.label, baseUrl: p.baseUrl, defaultModel: p.defaultModel, needsKey: p.needsKey,
  })));
});

app.get("/llm/config", (c) => {
  const row = getConfig();
  if (!row) return c.json(null);
  const masked = row.api_key ? `••••${row.api_key.slice(-4)}` : null;
  return c.json({ ...row, api_key: masked, has_key: !!row.api_key });
});

app.put("/llm/config",
  zValidator("json", z.object({
    provider: z.string(),
    api_key: z.string().optional(),
    model: z.string().min(1),
    base_url: z.string().nullable().optional(),
    auth_type: z.enum(["api_key", "oauth"]).default("api_key").optional(),
  })),
  (c) => {
    const b = c.req.valid("json");
    if (!(b.provider in PROVIDERS)) return c.json({ error: "Unknown provider" }, 400);
    const existing = getConfig();
    const apiKey = b.api_key !== undefined ? (b.api_key || null) : (existing?.api_key ?? null);
    const authType = b.auth_type ?? existing?.auth_type ?? "api_key";
    run(`INSERT INTO llm_config(id,provider,api_key,model,base_url,auth_type,updated_at)
         VALUES(1,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           provider=excluded.provider, api_key=excluded.api_key,
           model=excluded.model, base_url=excluded.base_url,
           auth_type=excluded.auth_type, updated_at=excluded.updated_at`,
        b.provider, apiKey, b.model, b.base_url ?? null, authType, now());
    return c.json({ ok: true });
  });

app.post("/llm/test", async (c) => {
  const cfg = getConfig();
  if (!cfg) return c.json({ ok: false, error: "not configured" });
  try {
    const reply = await callChat(cfg, [
      { role: "system", content: "Reply with exactly the word: PONG" },
      { role: "user", content: "ping" },
    ]);
    return c.json({ ok: true, reply: reply.slice(0, 200) });
  } catch (e: any) {
    return c.json({ ok: false, error: String(e?.message ?? e) });
  }
});

// ── OAuth: GitHub Copilot (device code) ───────────────────────────────────────────
app.post("/auth/copilot/start", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const d = await copilotStartDevice(body.enterpriseDomain);
    return c.json(d);
  } catch (e: any) { return c.json({ error: String(e?.message ?? e) }, 500); }
});

app.post("/auth/copilot/poll", async (c) => {
  const { device_code } = await c.req.json();
  const r = await copilotPollDevice(device_code);
  return c.json(r);
});

app.get("/auth/status", (c) => {
  return c.json({
    github_copilot: !!getToken("github_copilot")?.refresh_token,
    anthropic:      !!getToken("anthropic")?.refresh_token,
  });
});

app.post("/auth/:provider/logout", (c) => {
  clearToken(c.req.param("provider"));
  return c.json({ ok: true });
});

// ── OAuth: Anthropic Claude Pro/Max ───────────────────────────────────────────────
app.post("/auth/anthropic/start", (c) => {
  const r = anthropicStart();
  return c.json(r);
});

app.post("/auth/anthropic/poll", async (c) => c.json(await anthropicPoll()));

app.post("/auth/anthropic/manual", async (c) => {
  const { input } = await c.req.json();
  return c.json(await anthropicFinishManual(input));
});

// ── CSV import for finance ───────────────────────────────────────────────────────────────────────────
app.post("/finance/import", async (c) => {
  // Expected CSV: date,amount,category,note[,kind]
  // date = YYYY-MM-DD or MM/DD/YYYY; amount positive=expense, negative or kind=income for income.
  const body = await c.req.text();
  const rows = body.split(/\r?\n/).filter(Boolean);
  let imported = 0, failed = 0;
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i]!;
    if (i === 0 && /date/i.test(line) && /amount/i.test(line)) continue;   // header
    const cols = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
    const [d, amtStr, cat, note, kindStr] = cols;
    if (!d || !amtStr) { failed++; continue; }
    let iso = d;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [m, day, y] = d.split("/"); iso = `${y}-${m}-${day}`; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { failed++; continue; }
    const amt = parseFloat(amtStr);
    if (!Number.isFinite(amt)) { failed++; continue; }
    const kind = kindStr?.toLowerCase() === "income" || amt < 0 ? "income" : "expense";
    const amount = Math.abs(amt);
    run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
        new Date(`${iso}T12:00:00`).toISOString(), amount, (cat || "misc").toLowerCase(), note || null, kind);
    imported++;
  }
  return c.json({ ok: true, imported, failed });
});

// ── seed demo data ─────────────────────────────────────────────────────────────────────────────
app.post("/dev/seed", async (c) => {
  const daysBack = Number(c.req.query("days") ?? 60);
  const cats = ["food", "transport", "rent", "subscriptions", "shopping", "health", "entertainment"];
  const habits = q<{ id: number; name: string }>("SELECT id,name FROM habits");
  const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
  const irand = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));

  for (let i = daysBack; i >= 0; i--) {
    const dObj = new Date(Date.now() - i * 864e5);
    const day = `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,"0")}-${String(dObj.getDate()).padStart(2,"0")}`;
    const isoAt = (h: number, m = 0) => new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate(), h, m).toISOString();

    // sleep
    const hrs = Math.round((6 + Math.random() * 3) * 10) / 10;
    run("INSERT OR REPLACE INTO sleep(day,bedtime,waketime,hours,quality,note,updated_at) VALUES(?,?,?,?,?,?,?)",
        day, "23:30", "07:00", hrs, irand(4, 9), null, now());

    // weight (slow drift)
    const kg = Math.round((72 - i * 0.02 + (Math.random() - 0.5) * 0.6) * 10) / 10;
    run("INSERT OR REPLACE INTO weight(day,kg,note,updated_at) VALUES(?,?,?,?)", day, kg, null, now());

    // mood 2d (1-3 samples)
    for (let k = 0; k < irand(1, 3); k++) {
      run("INSERT INTO mood2d(ts,energy,valence,tag,note) VALUES(?,?,?,?,?)",
          isoAt(irand(9, 21)), irand(3, 9), irand(3, 9), ["focused","calm","anxious","tired","happy"][irand(0,4)], null);
    }

    // meals
    for (const [h, name, kcal] of [[8,"breakfast",irand(300,600)],[13,"lunch",irand(500,900)],[19,"dinner",irand(500,900)]] as [number,string,number][]) {
      run("INSERT INTO meals(ts,name,kcal,protein_g,carbs_g,fat_g,note) VALUES(?,?,?,?,?,?,?)",
          isoAt(h), name, kcal, irand(15,40), irand(40,120), irand(10,30), null);
    }

    // transactions (0-4/day)
    for (let k = 0; k < irand(0, 4); k++) {
      run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
          isoAt(irand(9, 21)), Math.round(rand(3, 80) * 100) / 100, cats[irand(0, cats.length - 1)]!, null, "expense");
    }
    if (i % 30 === 0) {
      run("INSERT INTO transactions(ts,amount,category,note,kind) VALUES(?,?,?,?,?)",
          isoAt(10), 3000, "salary", "monthly", "income");
    }

    // time sessions (0-3/day of work)
    for (let k = 0; k < irand(0, 3); k++) {
      const start = new Date(dObj.getFullYear(), dObj.getMonth(), dObj.getDate(), irand(9, 15), 0);
      const end   = new Date(start.getTime() + rand(0.5, 2.5) * 3600_000);
      run("INSERT INTO time_sessions(label,category,started_at,ended_at) VALUES(?,?,?,?)",
          ["deep work","emails","meetings","design","code"][irand(0,4)], "work", start.toISOString(), end.toISOString());
    }

    // habit check-offs (~70% hit)
    for (const h of habits) {
      if (Math.random() < 0.7) {
        try { run("INSERT INTO habit_logs(habit_id,day,note) VALUES(?,?,?)", h.id, day, null); } catch {}
      }
    }

    // wins/gratitude every ~3 days
    if (i % 3 === 0) {
      run("INSERT INTO wins(day,ts,text) VALUES(?,?,?)", day, isoAt(21), ["shipped a change","held a boundary","walked without phone","cooked dinner"][irand(0,3)]);
      run("INSERT INTO gratitudes(day,ts,text) VALUES(?,?,?)", day, isoAt(21), ["quiet morning","good coffee","call with a friend","sunlight"][irand(0,3)]);
    }
  }

  // seed a couple of holdings if empty
  const hc = q1<{ v: number }>("SELECT COUNT(*) v FROM holdings");
  if ((hc?.v ?? 0) === 0) {
    run("INSERT INTO holdings(symbol,kind,shares,cost_basis,currency,note,created_at) VALUES(?,?,?,?,?,?,?)",
        "AAPL", "stock", 3, 150, "USD", null, now());
    run("INSERT INTO holdings(symbol,kind,shares,cost_basis,currency,note,created_at) VALUES(?,?,?,?,?,?,?)",
        "VOO", "etf", 2, 400, "USD", null, now());
    run("INSERT INTO holdings(symbol,kind,shares,cost_basis,currency,note,created_at) VALUES(?,?,?,?,?,?,?)",
        "BTC-USD", "crypto", 0.05, 40000, "USD", null, now());
  }

  return c.json({ ok: true, seeded_days: daysBack });
});

// ── clear demo data (careful) ────────────────────────────────────────────────────────────────
app.post("/dev/wipe", (c) => {
  for (const t of ["transactions","moods","mood2d","time_sessions","tasks","sleep","weight","meals","wins","gratitudes","habit_logs","journals"]) {
    run(`DELETE FROM ${t}`);
  }
  return c.json({ ok: true });
});

const port = Number(process.env.PORT ?? 8787);
console.log(`⚡ LifeOS backend on http://127.0.0.1:${port}`);
export default { port, fetch: app.fetch };
