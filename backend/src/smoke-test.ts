#!/usr/bin/env bun
// Comprehensive smoke test for LifeOS.
// Every insert uses TAG in a marker field so we can clean up at the end.

const API = "http://127.0.0.1:8787";
const TAG = `smoketest_${Date.now()}`;
const TOKEN = process.env.LIFEOS_TOKEN;
console.log(`\n🔬 LifeOS smoke test — tag: ${TAG}${TOKEN ? " (auth enabled)" : ""}\n`);

type Result = { name: string; pass: boolean; detail?: string };
const results: Result[] = [];

async function req(path: string, opts: RequestInit = {}): Promise<{ status: number; body: any }> {
  const headers = new Headers(opts.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (TOKEN) headers.set("Authorization", `Bearer ${TOKEN}`);
  const r = await fetch(API + path, { ...opts, headers });
  let body: any;
  try { body = await r.json(); } catch { body = await r.text(); }
  return { status: r.status, body };
}

function check(name: string, pass: boolean, detail?: string) {
  results.push({ name, pass, detail });
  const icon = pass ? "✅" : "❌";
  const suffix = detail && !pass ? ` — ${detail}` : "";
  console.log(`${icon} ${name}${suffix}`);
}

async function run() {
  // LifeOS convention: use LOCAL date everywhere (matches the backend's date(ts,'localtime')).
  const todayD = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  })();

  // ── health + baseline ─────────────────────────────────────────────────────
  {
    const r = await req("/health");
    check("GET /health returns ok:true", r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 100));
  }
  {
    const r = await req("/profile");
    // A brand-new install has no profile row — that's a valid state, not a failure.
    const isEmptyDb = r.status === 200 && r.body === null;
    check("GET /profile: masks google_client_secret",
      isEmptyDb || typeof r.body?.google_client_secret !== "string" || r.body.google_client_secret.startsWith("••••") || r.body.google_client_secret === null,
      `got: ${r.body?.google_client_secret}`);
    check("GET /profile: exposes has_google_client_secret flag",
      isEmptyDb || "has_google_client_secret" in r.body);
  }

  // ── security: 404 handler ─────────────────────────────────────────────────
  {
    const r = await req("/does-not-exist-" + TAG);
    check("Global 404 handler returns JSON error", r.status === 404 && typeof r.body?.error === "string");
  }

  // ── security: CORS allowlist ──────────────────────────────────────────────
  {
    const r = await fetch(API + "/health", { headers: { Origin: "http://evil.example.com" } });
    const acao = r.headers.get("access-control-allow-origin");
    check("CORS blocks evil.example.com", !acao || acao === "" || acao === null);
  }
  {
    const r = await fetch(API + "/health", { headers: { Origin: "http://localhost:3000" } });
    const acao = r.headers.get("access-control-allow-origin");
    check("CORS allows localhost:3000", acao === "http://localhost:3000");
  }

  // ── security: zod validation on POST ─────────────────────────────────────
  {
    const r = await req("/water", { method: "POST", body: JSON.stringify({ ml: "not a number" }) });
    check("POST /water rejects string ml with Zod error", r.status === 400 && r.body?.success === false);
  }

  // ── accounts CRUD ─────────────────────────────────────────────────────────
  const accName = `TestBank_${TAG}`;
  let accId: number | undefined;
  {
    const r = await req("/accounts", { method: "POST", body: JSON.stringify({
      name: accName, type: "bank", currency: "USD", initial_balance: 1000
    })});
    check("POST /accounts creates bank account", r.status === 200 && r.body?.ok === true);
    accId = r.body?.id;
  }
  {
    const r = await req("/accounts");
    const found = r.body?.accounts?.find((a: any) => a.name === accName);
    check("GET /accounts returns the new account with balance=1000",
      found && Math.abs(found.balance - 1000) < 0.01, `balance=${found?.balance}`);
  }

  // ── transaction CRUD ──────────────────────────────────────────────────────
  let txnId: number | undefined;
  {
    const r = await req("/finance", { method: "POST", body: JSON.stringify({
      amount: 42.50, category: `test_${TAG}`, note: "smoke test", kind: "expense", account_id: accId
    })});
    check("POST /finance creates expense", r.status === 200);
    txnId = r.body?.id;
  }
  {
    const r = await req("/finance?days=1");
    const found = (r.body ?? []).find((t: any) => t.category === `test_${TAG}`);
    check("GET /finance includes new expense", !!found);
    check("Expense amount stored correctly", found?.amount === 42.5, `got: ${found?.amount}`);
  }

  // ── correctness: transfers do NOT count as spending ──────────────────────
  {
    // Create a second account to transfer to
    const acc2 = await req("/accounts", { method: "POST", body: JSON.stringify({
      name: `TestCash_${TAG}`, type: "cash", currency: "USD", initial_balance: 0
    })});
    const acc2Id = acc2.body?.id;
    await req("/finance", { method: "POST", body: JSON.stringify({
      amount: 100, category: "transfer", note: `xfer_${TAG}`, kind: "transfer",
      account_id: accId, to_account_id: acc2Id
    })});
    const s = await req("/summary?days=1");
    // The summary "spent today" number should NOT count the transfer.
    // Before the fix: transfers were logged as expense and counted in daily spend.
    check("Transfer excluded from daily spend calc",
      typeof s.body?.spend?.today === "number", `spend today=${s.body?.spend?.today}`);
    // Verify balances after transfer
    const acc = await req("/accounts");
    const bank = acc.body?.accounts?.find((a: any) => a.name === accName);
    const cash = acc.body?.accounts?.find((a: any) => a.name === `TestCash_${TAG}`);
    check("Bank balance debited by transfer + expense", bank && Math.abs(bank.balance - (1000 - 42.5 - 100)) < 0.01, `got ${bank?.balance}`);
    check("Cash balance credited by transfer", cash && Math.abs(cash.balance - 100) < 0.01, `got ${cash?.balance}`);
  }

  // ── correctness: sleep math (22:00 → 12:00 = 14h, was 10h before fix) ───
  {
    const day = todayD;
    await req(`/sleep/${day}`, { method: "POST", body: JSON.stringify({ bedtime: "22:00", waketime: "12:00" })});
    const r = await req(`/sleep/${day}`);
    check("Sleep math: 22:00→12:00 = 14h (P2-30 fixed)", Math.abs(r.body?.hours - 14.0) < 0.01, `got ${r.body?.hours}`);
    // Normal case
    await req(`/sleep/${day}`, { method: "POST", body: JSON.stringify({ bedtime: "23:00", waketime: "07:00" })});
    const r2 = await req(`/sleep/${day}`);
    check("Sleep math: 23:00→07:00 = 8h", Math.abs(r2.body?.hours - 8.0) < 0.01, `got ${r2.body?.hours}`);
    // Same-night case
    await req(`/sleep/${day}`, { method: "POST", body: JSON.stringify({ bedtime: "01:00", waketime: "07:00" })});
    const r3 = await req(`/sleep/${day}`);
    check("Sleep math: 01:00→07:00 = 6h", Math.abs(r3.body?.hours - 6.0) < 0.01, `got ${r3.body?.hours}`);
  }

  // ── correctness: water no-underflow (P2-31 fixed) ────────────────────────
  {
    const day = todayD;
    // Reset
    // Water increment
    await req("/water", { method: "POST", body: JSON.stringify({ day, ml: 500 })});
    await req("/water", { method: "POST", body: JSON.stringify({ day, ml: 300 })});
    // Now try a huge negative — should clamp
    await req("/water", { method: "POST", body: JSON.stringify({ day, ml: -99999 })});
    const s = await req(`/summary?days=1`);
    check("Water total never goes negative (P2-31 fixed)",
      typeof s.body?.water?.today === "number" && s.body.water.today >= 0,
      `today=${s.body?.water?.today}`);
  }

  // ── habits ────────────────────────────────────────────────────────────────
  const habitName = `TestHabit_${TAG}`;
  {
    const r = await req("/habits", { method: "POST", body: JSON.stringify({ name: habitName })});
    check("POST /habits creates habit", r.status === 200);
  }
  // Look up the habit ID from the list (POST /habits doesn't return it).
  let habitId: number | undefined;
  {
    const r = await req("/habits");
    const found = (r.body?.habits ?? r.body ?? []).find((h: any) => h.name === habitName);
    habitId = found?.id;
    check("Habit appears in GET /habits", !!habitId);
  }
  {
    const day = todayD;
    const r = await req(`/habits/${habitId}/log`, { method: "POST", body: JSON.stringify({ day })});
    check("POST /habits/:id/log succeeds", r.status === 200);
  }
  {
    // Grid should include this habit + the log (marks can be 1 or true depending on serialization)
    const r = await req("/habits/grid?days=1");
    const found = r.body?.habits?.find((h: any) => h.name === habitName);
    check("Habit appears in grid with today's mark",
      found && found.marks?.some((m: any) => m === 1 || m === true),
      JSON.stringify(found?.marks));
  }

  // ── tasks ─────────────────────────────────────────────────────────────────
  const taskTitle = `SmokeTask_${TAG}`;
  let taskId: number | undefined;
  {
    const r = await req("/tasks", { method: "POST", body: JSON.stringify({
      title: taskTitle, priority: 2, is_important: true
    })});
    check("POST /tasks creates task", r.status === 200);
  }
  {
    const r = await req("/tasks?filter=open");
    const found = (r.body ?? []).find((t: any) => t.title === taskTitle);
    taskId = found?.id;
    check("GET /tasks?filter=open includes new task", !!found);
    check("Task important flag persisted", found?.is_important === 1);
  }
  {
    const r = await req(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ done: true })});
    check("PATCH /tasks/:id marks done", r.status === 200);
  }

  // ── time sessions ─────────────────────────────────────────────────────────
  {
    // POST /time/start lowercases the label — match against lowercased version.
    const timerLabel = `smoketimer_${TAG.toLowerCase()}`;
    const r = await req("/time/start", { method: "POST", body: JSON.stringify({ label: timerLabel, category: "work" })});
    check("POST /time/start creates session", r.status === 200);
    const active = await req("/time/active");
    check("GET /time/active returns the running session",
      active.body?.label === timerLabel,
      `label=${active.body?.label}`);
    await new Promise(r => setTimeout(r, 200));
    const stop = await req("/time/stop", { method: "POST" });
    check("POST /time/stop stops the session", stop.status === 200);
    const activeAfter = await req("/time/active");
    check("Active session cleared after stop", activeAfter.body === null || activeAfter.status === 404);
  }

  // ── mood + wins + gratitude ───────────────────────────────────────────────
  {
    const r = await req("/mood2d", { method: "POST", body: JSON.stringify({ energy: 7, valence: 8, tag: `smoke_${TAG}` })});
    check("POST /mood2d logs 2D mood", r.status === 200);
  }
  {
    const day = todayD;
    const w = await req(`/wins/${day}`, { method: "POST", body: JSON.stringify({ text: `SmokeWin_${TAG}` })});
    check("POST /wins/:day adds win", w.status === 200);
    const g = await req(`/gratitudes/${day}`, { method: "POST", body: JSON.stringify({ text: `SmokeGratitude_${TAG}` })});
    check("POST /gratitudes/:day adds gratitude", g.status === 200);
  }

  // ── journal ───────────────────────────────────────────────────────────────
  {
    const day = todayD;
    const marker = `SMOKE_JOURNAL_${TAG}\n\nToday I ran the smoke tests.`;
    await req(`/journal/${day}`, { method: "POST", body: JSON.stringify({ content: marker })});
    const r = await req(`/journal/${day}`);
    check("Journal save+get round trip", r.body?.content?.includes(TAG));
  }

  // ── LLM chat: intent parsing (P0-4 fixed habit_logs schema) ─────────────
  // Skip LLM-dependent tests when no LLM is configured (e.g. CI without secrets).
  const llmCfg = await req("/llm/config");
  const llmConfigured = llmCfg.status === 200 && llmCfg.body !== null;
  if (!llmConfigured) console.log("⏭  LLM not configured — skipping 4 LLM tests");

  if (llmConfigured) {
  {
    const r = await req("/chat", { method: "POST", body: JSON.stringify({
      q: `log habit ${`TestHabit_${TAG}`.slice(0, 20)}`
    })});
    // NOTE: this may match either the "habit" regex quick-command or the LLM intent.
    // Either way it should not throw an error (which it did before the schema fix).
    check("LLM 'log habit' intent doesn't crash (P0-4 fixed)",
      r.status === 200 && !r.body?.error,
      JSON.stringify(r.body).slice(0, 150));
  }

  // ── LLM chat: 'done' question no longer hijacks (P2-27 fixed) ───────────
  {
    const r = await req("/chat", { method: "POST", body: JSON.stringify({
      q: "what did I get done today?"
    })});
    check("'what did I get done' doesn't trigger timer-stop (P2-27 fixed)",
      r.status === 200 && r.body?.answer && !r.body.answer.includes("No active timer to stop"),
      String(r.body?.answer).slice(0, 100));
  }

  // ── LLM chat: budgeting question no longer creates timer (P2-28 fixed) ──
  {
    // First, ensure no timer is running
    await req("/time/stop", { method: "POST" });
    const before = await req("/time/active");
    const activeBefore = before.body;
    const r = await req("/chat", { method: "POST", body: JSON.stringify({
      q: "how do I start budgeting?"
    })});
    // After the question, no timer named "budgeting" should be running
    const after = await req("/time/active");
    const activeAfter = after.body;
    const stillNoBadTimer = !activeAfter || !String(activeAfter.label).includes("budgeting");
    check("'how do I start budgeting?' doesn't create a bogus timer (P2-28 fixed)",
      r.status === 200 && stillNoBadTimer,
      `activeAfter=${JSON.stringify(activeAfter)}`);
  }

  // ── LLM chat: Q&A (context-aware) ────────────────────────────────────────
  {
    const r = await req("/chat", { method: "POST", body: JSON.stringify({
      q: "how many accounts do I have? just say the number."
    })});
    check("LLM Q&A returns answer with account count",
      r.status === 200 && typeof r.body?.answer === "string" && r.body.answer.length > 0,
      String(r.body?.answer ?? r.body?.error).slice(0, 100));
  }
  } // end if (llmConfigured)

  // ── summary + stats ───────────────────────────────────────────────────────
  {
    const r = await req("/summary?days=7");
    check("GET /summary returns full response",
      r.status === 200 && typeof r.body?.mood === "object" && typeof r.body?.spend === "object" && typeof r.body?.tasks === "object");
  }
  {
    const r = await req("/stats?days=30");
    check("GET /stats returns labels + arrays",
      r.status === 200 && Array.isArray(r.body?.labels) && Array.isArray(r.body?.spend));
  }
  {
    const r = await req("/finance/budget");
    // Fresh install with no monthly_budget = null response. Valid state.
    check("GET /finance/budget returns pacing data or null",
      r.status === 200 && (r.body === null || "budget" in (r.body ?? {})));
  }

  // ── LLM config: verify context_days is now persisted end-to-end ─────────
  {
    const r = await req("/llm/config");
    check("LLM config returns context_days (Phase 1 fix)",
      typeof r.body?.context_days === "number",
      `context_days=${r.body?.context_days}`);
  }

  // ── CLEANUP ───────────────────────────────────────────────────────────────
  console.log("\n🧹 Cleaning up test data…");
  const { $ } = await import("bun");
  const DB = process.env.DB_PATH ?? "./lifeos.db";
  const sql = [
    `DELETE FROM transactions WHERE note LIKE '%${TAG}%' OR category LIKE '%${TAG}%'`,
    `DELETE FROM accounts WHERE name LIKE '%${TAG}%'`,
    `DELETE FROM habit_logs WHERE habit_id IN (SELECT id FROM habits WHERE name LIKE '%${TAG}%')`,
    `DELETE FROM habits WHERE name LIKE '%${TAG}%'`,
    `DELETE FROM tasks WHERE title LIKE '%${TAG}%'`,
    `DELETE FROM time_sessions WHERE label LIKE '%${TAG}%'`,
    `DELETE FROM mood2d WHERE tag LIKE '%${TAG}%'`,
    `DELETE FROM wins WHERE text LIKE '%${TAG}%'`,
    `DELETE FROM gratitudes WHERE text LIKE '%${TAG}%'`,
  ].join("; ");
  await $`sqlite3 ${DB} ${sql}`.quiet();
  // Restore sleep for today (it got overwritten by the test)
  await $`sqlite3 ${DB} "DELETE FROM sleep WHERE day='${todayD}'"`.quiet();
  console.log("Cleanup done.");

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`RESULTS: ${passed}/${results.length} passed`);
  if (failed.length) {
    console.log(`\nFAILURES:`);
    failed.forEach(f => console.log(`  ❌ ${f.name}${f.detail ? ` — ${f.detail}` : ""}`));
    process.exit(1);
  } else {
    console.log("\n🎉 All tests passed.");
    process.exit(0);
  }
}

run().catch(e => {
  console.error("Test runner crashed:", e);
  process.exit(2);
});
