"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Summary, type Stats } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { StatsCharts } from "@/components/stats-charts";
import { Card } from "@/components/card";
import { Heart, Wallet, Timer, CheckSquare, Moon, Sparkles, Scale, Apple, Sun } from "lucide-react";
import { useProfile, currencySymbol, daysAlive, ageYears } from "@/lib/profile";
import { LivedCounter } from "@/components/lived-counter";
import { ChatWidget } from "@/components/chat-widget";
import { ActiveSession } from "@/components/active-session";

const QUOTES = [
  { text: "Atomic Habits", author: "James Clear", quote: "Motivation is unreliable. Behavior is driven by your environment. If you want to change a habit, change your physical cues." },
  { text: "Deep Work", author: "Cal Newport", quote: "Network tools fragment your attention. Schedule block time for deep work, and treat it with the same respect as a meeting." },
  { text: "Thinking, Fast and Slow", author: "Daniel Kahneman", quote: "Your brain defaults to the path of least resistance (System 1). Force System 2 thinking when evaluating major choices." },
  { text: "Man's Search for Meaning", author: "Viktor E. Frankl", quote: "Between stimulus and response, there is a space. In that space is our power to choose our response." },
  { text: "The Power of Habit", author: "Charles Duhigg", quote: "You cannot extinguish a bad habit, you can only change it. Keep the cue and reward, but insert a new routine." },
  { text: "Flow", author: "Mihaly Csikszentmihalyi", quote: "To achieve flow, the challenge of the task must perfectly match your skill level. Too hard = anxiety; too easy = boredom." },
  { text: "Drive", author: "Daniel H. Pink", quote: "True motivation comes from Autonomy, Mastery, and Purpose. Ensure your goals align with these three pillars." },
  { text: "Essentialism", author: "Greg McKeown", quote: "If it isn't a clear yes, then it's a clear no. Protect your time ruthlessly." },
  { text: "Mindset", author: "Carol S. Dweck", quote: "Stop praising intelligence or talent. Praise the process, the effort, and the strategy. This builds resilience." },
  { text: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey", quote: "Put first things first. Don't prioritize what's on your schedule; schedule your priorities." }
];

function DailyQuote() {
  const [quote, setQuote] = useState(QUOTES[0]);

  useEffect(() => {
    const updateQuote = () => {
      // Cycle every hour deterministically based on date and time
      const hour = new Date().getHours();
      const day = new Date().getDate();
      const index = (day * 24 + hour) % QUOTES.length;
      setQuote(QUOTES[index]);
    };
    updateQuote();
    const id = setInterval(updateQuote, 60000); // Check every minute
    return () => clearInterval(id);
  }, []);

  if (!quote) return null;

  return (
    <div className="rounded-2xl border border-border bg-card/40 px-6 py-5 2xl:px-8 2xl:py-6 backdrop-blur shadow-sm text-center flex flex-col items-center justify-center animate-in fade-in duration-1000">
      <p className="text-sm 2xl:text-base font-medium italic text-muted-foreground/90 max-w-2xl 2xl:max-w-3xl leading-relaxed">
        "{quote.quote}"
      </p>
      <div className="text-[10px] 2xl:text-xs font-bold uppercase tracking-widest mt-3 text-primary/70">
        — {quote.author}, {quote.text}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [today, setToday] = useState<Summary | null>(null);   // fixed: always today (rolling 7d for "week" avg)
  const [ranged, setRanged] = useState<Summary | null>(null); // range-driven averages
  const [stats, setStats] = useState<Stats | null>(null);
  const [budget, setBudget] = useState<any>(null);
  const [range, setRange] = useState<number>(30);
  const { profile } = useProfile();
  const sym = currencySymbol(profile?.currency);
  const firstName = profile?.name?.split(" ")[0] ?? "";
  const displayName = firstName ? firstName[0]!.toUpperCase() + firstName.slice(1) : "";
  const alive = daysAlive(profile?.dob);
  const age = ageYears(profile?.dob);

  // Load "today" once + on tick (never range-dependent)
  useEffect(() => {
    const load = () => {
      api.summary(7).then(setToday).catch(() => {});
      api.financeBudget().then(setBudget).catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Range-dependent trend + averages
  useEffect(() => {
    api.summary(range).then(setRanged).catch(() => {});
    api.stats(range).then(setStats).catch(() => {});
  }, [range]);

  return (
    <div className="mx-auto max-w-7xl 2xl:max-w-[1700px] space-y-6 md:space-y-8 2xl:space-y-10">
      <Header firstName={displayName} alive={alive} age={age} goal={profile?.goal} />
      <DailyQuote />
      <ActiveSession />

      {/* Today */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Today</h2>
          <div className="flex items-center gap-2">
            <ChatWidget onAction={() => {
              api.summary(7).then(setToday).catch(() => {});
              api.summary(range).then(setRanged).catch(() => {});
              api.stats(range).then(setStats).catch(() => {});
              api.financeBudget().then(setBudget).catch(() => {});
            }} />
            <span className="text-xs text-muted-foreground hidden sm:inline">
              or <kbd className="rounded border border-border px-1.5 py-0.5">⌘K</kbd>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3 2xl:gap-4">
          <StatCard compact icon={Heart} label="Mood"
            value={today?.mood.today != null ? today.mood.today.toFixed(1) : "—"}
            sub={today?.mood.today == null ? "not logged" : "logged today"}
            tone={today?.mood.today == null ? "default" : today.mood.today >= 7 ? "good" : today.mood.today >= 4 ? "default" : "warn"} />
          <StatCard compact icon={Moon} label="Sleep"
            value={today?.sleep.last?.hours != null ? `${today.sleep.last.hours}h` : "—"}
            sub={today?.sleep.last?.day === today?.day ? "logged" : "log tonight"}
            tone={today?.sleep.last?.hours == null ? "default" :
                  profile?.sleep_target_hours && today.sleep.last.hours >= profile.sleep_target_hours ? "good" :
                  today.sleep.last.hours >= 6 ? "default" : "warn"} />
          <StatCard compact icon={Timer} label="Deep work"
            value={`${today?.time.today ?? 0}h`}
            sub="tracked today"
            tone={(today?.time.today ?? 0) >= 6 ? "good" : (today?.time.today ?? 0) >= 3 ? "default" : "warn"} />
          <StatCard compact icon={CheckSquare} label="Tasks"
            value={`${today?.tasks.done_today ?? 0}/${(today?.tasks.done_today ?? 0) + (today?.tasks.open ?? 0)}`}
            sub={today?.tasks.overdue ? `${today.tasks.overdue} overdue` : "on track"}
            tone={today?.tasks.overdue ? "bad" : "default"} />

          <StatCard compact icon={Wallet} label="Spent"
            value={today ? `${sym}${today.spend.today.toFixed(0)}` : "—"}
            sub={budget ? (budget.safe_to_spend_today < 0 ? "over budget" : "under budget") : "today only"}
            tone={budget ? (budget.safe_to_spend_today < 0 ? "bad" : "good") : "default"} />
          <StatCard compact icon={Apple} label="Calories"
            value={today?.calories?.today ?? 0}
            sub="today only"
            tone={(today?.calories?.today ?? 0) > 2500 ? "warn" : "default"} />
          <StatCard compact icon={Sparkles} label="Wins"
            value={today?.positive.wins ?? 0}
            sub="logged today"
            tone={(today?.positive.wins ?? 0) > 0 ? "good" : "default"} />
          <StatCard compact icon={Heart} label="Gratitude"
            value={today?.positive.gratitude ?? 0}
            sub="logged today"
            tone={(today?.positive.gratitude ?? 0) > 0 ? "good" : "default"} />
        </div>

        <NudgeCard s={today} />
      </section>

      {/* Trend — range-driven */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Trend</h2>
          <RangeToggle range={range} setRange={setRange} />
        </div>

        <Card className="p-0 overflow-hidden">
          <StatsCharts stats={stats} />
        </Card>
      </section>

      {/* Shortcuts — below Trend, full-width row so it scales with the page instead
          of being squeezed into a fixed-width sidebar. */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">Shortcuts</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <ShortcutCard href="/journal" title="Reflect" body="Journal, wins, gratitude — the mind-clearing routine." />
          <ShortcutCard href="/tasks" title="Tasks" body="Plan what to do next in your Eisenhower matrix." />
          <ShortcutCard href="/time?mode=pomodoro" title="Deep Work" body="Start a Pomodoro or stopwatch timer." />
        </div>
      </section>
    </div>
  );
}

function Header({ firstName, alive, age, goal }: { firstName: string; alive: number | null; age: number | null; goal?: string | null }) {
  const [mounted, setMounted] = useState(false);
  const [, tick] = useState(0);
  const [active, setActive] = useState<{ label: string; category: string; started_at: string } | null>(null);
  useEffect(() => {
    setMounted(true);
    const loadTimer = () => api.timeActive().then(a => setActive(a as any)).catch(() => {});
    loadTimer();
    const clockId = setInterval(() => tick(t => t + 1), 1000);
    const activeId = setInterval(loadTimer, 10_000);
    return () => { clearInterval(clockId); clearInterval(activeId); };
  }, []);

  const now = new Date();
  const greet =
    now.getHours() < 5  ? "Still up"    :
    now.getHours() < 12 ? "Good morning":
    now.getHours() < 17 ? "Good afternoon":
    now.getHours() < 21 ? "Good evening": "Good night";
  const dateStr = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  // Force uppercase AM/PM (en-IN locale returns lowercase); render only after client mount to avoid SSR mismatch.
  const timeStr = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true }).toUpperCase();

  return (
    <header className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl md:text-3xl 2xl:text-4xl font-semibold tracking-tight">
          {greet}{firstName && `, ${firstName}`}.
        </h1>
        <div suppressHydrationWarning className="text-lg 2xl:text-xl font-medium tabular-nums text-muted-foreground min-h-[1.75rem]">
          {mounted ? timeStr : ""}
        </div>
      </div>
      {active && (
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          <span>Working on <b className="font-medium">{active.label}</b> · <span className="text-muted-foreground">{elapsedShort(active.started_at)}</span></span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span suppressHydrationWarning className="flex items-center gap-1.5">
          <Sun className="h-3.5 w-3.5" /> {mounted ? dateStr : ""}
        </span>
        {mounted && (alive != null ? <LivedCounterWrap /> :
          <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">Set your DOB in Settings for the lived counter</Link>
        )}
        {goal && <span className="italic">focus: {goal}</span>}
      </div>
    </header>
  );
}

function elapsedShort(startIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function LivedCounterWrap() {
  const { profile } = useProfile();
  if (!profile?.dob) return null;
  return <LivedCounter dob={profile.dob} />;
}

function RangeToggle({ range, setRange }: { range: number; setRange: (n: number) => void }) {
  const opts: [number, string][] = [[7, "7d"], [30, "30d"], [90, "90d"], [365, "1y"]];
  return (
    <div className="inline-flex rounded-lg border border-border bg-card/40 p-0.5 text-xs">
      {opts.map(([n, l]) => (
        <button key={n} onClick={() => setRange(n)}
          className={`px-3 py-1.5 rounded-md transition ${range === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

function rangeLabel(n: number) {
  if (n <= 7)   return "7d";
  if (n <= 30)  return "30d";
  if (n <= 90)  return "90d";
  return "1y";
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card/40 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ShortcutCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="group block rounded-2xl border border-border bg-card/60 backdrop-blur p-5 hover:bg-card transition">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{body}</div>
      <div className="mt-3 text-xs text-primary opacity-0 group-hover:opacity-100 transition">open →</div>
    </Link>
  );
}

function NudgeCard({ s }: { s: Summary | null }) {
  let msg = "You're doing fine.";
  let tone: "default" | "warn" | "good" = "default";
  if (!s)                                        msg = "loading…";
  else if (s.sleep.last?.hours == null)          { msg = "Log sleep — it colors everything else.";     tone = "warn"; }
  else if (s.positive.wins === 0)                { msg = "Notice one win today. It compounds."; }
  else if (s.positive.gratitude === 0)           { msg = "One line of gratitude — 10 seconds."; }
  else if (s.mood.today == null)                 { msg = "Quick mood check-in?"; }
  else if (s.tasks.overdue > 0)                  { msg = `${s.tasks.overdue} overdue — reschedule or drop them.`; tone = "warn"; }
  else                                            { msg = "All the basics are logged. Nice.";          tone = "good"; }
  return (
    <div className={`rounded-xl border border-border bg-card/40 px-4 py-3 text-sm ${
      tone === "warn" ? "text-amber-500" : tone === "good" ? "text-emerald-500" : "text-foreground"
    }`}>
      {msg}
    </div>
  );
}
