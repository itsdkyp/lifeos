"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { X, ArrowRight } from "lucide-react";

/**
 * Natural-language quick logger. Examples:
 *   spent 12 lunch food          → transaction (expense)
 *   earned 500 salary            → transaction (income)
 *   mood 8 6 focused             → mood2d (valence=8, energy=6, tag=focused)
 *   task buy milk tomorrow       → task (with due date)
 *   task !! prep talk friday     → task priority=3
 *   win shipped LifeOS           → win
 *   grateful quiet morning       → gratitude
 *   sleep 23:30 07:15 8          → sleep (bed, wake, quality)
 *   habit read                   → check off habit "read" today
 *   start deep work              → start time session
 *   stop                         → stop active timer
 *   journal <text>               → append to today's journal
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err"; text?: string }>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(""); setStatus({ kind: "idle" }); setTimeout(() => inputRef.current?.focus(), 10); }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onOpenChange]);

  async function submit() {
    const text = q.trim();
    if (!text) return;
    try {
      const msg = await parseAndDispatch(text);
      setStatus({ kind: "ok", text: msg });
      setQ("");
      setTimeout(() => onOpenChange(false), 700);
    } catch (e: any) {
      setStatus({ kind: "err", text: e?.message ?? "Could not parse. Try `spent 12 lunch` or `mood 8 6`." });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
         onClick={() => onOpenChange(false)}>
      <div onClick={(e) => e.stopPropagation()}
           className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <input ref={inputRef} value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="log anything… (spent 12 lunch, mood 8 6 focused, task buy milk tomorrow)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
          <button onClick={submit}
            className="rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs flex items-center gap-1 hover:opacity-90">
            log <ArrowRight className="h-3 w-3" />
          </button>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 text-xs text-muted-foreground space-y-1">
          <div>{status.kind === "ok"  && <span className="text-emerald-500">✓ {status.text}</span>}</div>
          <div>{status.kind === "err" && <span className="text-destructive">! {status.text}</span>}</div>
          <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 font-mono">
            <span><b className="text-foreground">spent</b> 12 lunch food</span>
            <span><b className="text-foreground">mood</b> 8 6 focused</span>
            <span><b className="text-foreground">task</b> buy milk tomorrow</span>
            <span><b className="text-foreground">win</b> shipped it</span>
            <span><b className="text-foreground">grateful</b> quiet morning</span>
            <span><b className="text-foreground">sleep</b> 23:30 7:15 8</span>
            <span><b className="text-foreground">weight</b> 72.4</span>
            <span><b className="text-foreground">meal</b> chicken bowl 650</span>
            <span><b className="text-foreground">buy</b> AAPL 3 150</span>
            <span><b className="text-foreground">habit</b> read</span>
            <span><b className="text-foreground">start</b>/<b className="text-foreground">stop</b> deep work</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── parser ──────────────────────────────────────────────────────────────────
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function dateFromWord(w: string): string | undefined {
  const t = new Date();
  if (w === "today")     return today();
  if (w === "tomorrow")  { t.setDate(t.getDate()+1); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; }
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const idx = days.indexOf(w);
  if (idx >= 0) {
    let add = (idx - t.getDay() + 7) % 7; if (add === 0) add = 7;
    t.setDate(t.getDate()+add);
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  return undefined;
}

async function parseAndDispatch(input: string): Promise<string> {
  const raw = input.replace(/\s+/g, " ").trim();
  const [rawCmd, ...restArr] = raw.split(" ");
  const cmd = rawCmd!.toLowerCase();
  const rest = restArr.join(" ");

  // Finance
  if (["spent", "expense", "paid", "buy", "bought"].includes(cmd)) {
    const m = rest.match(/^(\d+(?:\.\d+)?)\s+(\S+)(?:\s+(.+))?$/);
    if (!m) throw new Error("try: spent <amount> <category> [note]");
    await api.addTxn({ amount: parseFloat(m[1]!), category: m[2]!, note: m[3] ?? "", kind: "expense" });
    return `spent ${m[1]} on ${m[2]}`;
  }
  if (["earned", "income", "got"].includes(cmd)) {
    const m = rest.match(/^(\d+(?:\.\d+)?)\s+(\S+)(?:\s+(.+))?$/);
    if (!m) throw new Error("try: earned <amount> <category> [note]");
    await api.addTxn({ amount: parseFloat(m[1]!), category: m[2]!, note: m[3] ?? "", kind: "income" });
    return `earned ${m[1]} from ${m[2]}`;
  }

  // Mood 2D:  mood <valence> <energy> [tag] [note]
  if (cmd === "mood") {
    const m = rest.match(/^(\d{1,2})(?:\s+(\d{1,2}))?(?:\s+(\S+))?(?:\s+(.+))?$/);
    if (!m) throw new Error("try: mood 8 6 focused");
    const valence = clamp(+m[1]!, 1, 10);
    const energy  = m[2] ? clamp(+m[2]!, 1, 10) : 5;
    await api.mood2dLog({ valence, energy, tag: m[3], note: m[4] });
    return `mood ${valence}/${energy}`;
  }

  // Wins / gratitude
  if (["win", "wins"].includes(cmd)) {
    if (!rest) throw new Error("try: win <what you did>");
    await api.winAdd(today(), rest);
    return "win logged ✨";
  }
  if (["grateful", "gratitude", "thanks"].includes(cmd)) {
    if (!rest) throw new Error("try: grateful <what for>");
    await api.gratitudeAdd(today(), rest);
    return "gratitude logged 🙏";
  }

  // Sleep: sleep 23:30 7:15 [quality]
  if (cmd === "sleep") {
    const m = rest.match(/^(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})(?:\s+(\d{1,2}))?(?:\s+(.+))?$/);
    if (!m) throw new Error("try: sleep 23:30 7:15 8");
    await api.sleepSave(today(), {
      bedtime: m[1]!, waketime: m[2]!,
      quality: m[3] ? clamp(+m[3]!, 1, 10) : undefined,
      note: m[4],
    });
    return "sleep logged 💤";
  }

  // Habit check-off
  if (cmd === "habit") {
    if (!rest) throw new Error("try: habit <name>");
    const habits = await api.habits();
    const match = habits.find(h => h.name.toLowerCase().includes(rest.toLowerCase()));
    if (!match) throw new Error(`no habit matching "${rest}"`);
    await api.habitLog(match.id, today());
    return `✓ ${match.name}`;
  }

  // Tasks:  task [!! | !!!] <title...> [tomorrow|monday|YYYY-MM-DD]
  if (cmd === "task") {
    let text = rest;
    let priority: 1 | 2 | 3 = 2;
    const pri = text.match(/^(!+)\s+/);
    if (pri) { priority = Math.min(3, pri[1]!.length) as 1 | 2 | 3; text = text.slice(pri[0]!.length); }
    // trailing date word
    const words = text.split(" ");
    let due: string | undefined;
    const last = words[words.length - 1]?.toLowerCase();
    if (last) { const d = dateFromWord(last); if (d) { due = d; words.pop(); } }
    const title = words.join(" ").trim();
    if (!title) throw new Error("try: task <title> [today|tomorrow|friday|2026-08-01]");
    await api.taskAdd({ title, priority, due_date: due });
    return `task added${due ? ` · due ${due}` : ""}`;
  }

  // Weight:  weight 72.4 [note]
  if (cmd === "weight" || cmd === "kg") {
    const m = rest.match(/^(\d+(?:\.\d+)?)(?:\s+(.+))?$/);
    if (!m) throw new Error("try: weight 72.4");
    await api.weightAdd(parseFloat(m[1]!), undefined, m[2]);
    return `weight ${m[1]} kg logged`;
  }

  // Meal:  meal <name> <kcal> [p c f]
  if (cmd === "meal" || cmd === "ate" || cmd === "eat") {
    const m = rest.match(/^(.+?)\s+(\d+)(?:\s+(\d+)\s+(\d+)\s+(\d+))?$/);
    if (!m) throw new Error("try: meal chicken bowl 650  (or) meal salad 400 30 40 15");
    await api.mealAdd({
      name: m[1]!.trim(), kcal: parseInt(m[2]!, 10),
      protein_g: m[3] ? +m[3]! : undefined,
      carbs_g:   m[4] ? +m[4]! : undefined,
      fat_g:     m[5] ? +m[5]! : undefined,
    });
    return `${m[1]!.trim()} · ${m[2]} kcal`;
  }

  // Investment:  buy AAPL 3 150   (kind guessed by suffix)
  if (cmd === "buy" || cmd === "hold" || cmd === "invest") {
    const m = rest.match(/^(\S+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
    if (!m) throw new Error("try: buy AAPL 3 150   (shares, cost per unit)");
    const sym = m[1]!.toUpperCase();
    const kind: "stock"|"etf"|"crypto"|"mf"|"debt" =
      /-USD$|BTC|ETH/.test(sym) ? "crypto" :
      /\.MF$|MF$/.test(sym)      ? "mf"     :
      /VOO|SPY|QQQ|VTI/.test(sym) ? "etf"   : "stock";
    await api.holdingAdd({ symbol: sym, kind, shares: +m[2]!, cost_basis: +m[3]! });
    return `bought ${sym} × ${m[2]}`;
  }

  // Time
  if (cmd === "start") {
    if (!rest) throw new Error("try: start <what you're doing>");
    await api.timeStart(rest);
    return `timer started · ${rest}`;
  }
  if (cmd === "stop") { await api.timeStop(); return "timer stopped"; }

  // Journal append
  if (cmd === "journal" || cmd === "note") {
    if (!rest) throw new Error("try: journal <text>");
    const day = today();
    const cur = await api.journalGet(day);
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const merged = (cur.content ? cur.content + "\n\n" : "") + `[${stamp}] ${rest}`;
    await api.journalSave(day, merged);
    return "journal appended";
  }

  throw new Error(`unknown: "${cmd}". Try one of: spent, mood, task, win, grateful, sleep, habit, start, stop, journal.`);
}

function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
