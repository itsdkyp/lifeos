"use client";
import { useEffect, useState } from "react";
import { api, type Session } from "@/lib/api";
import { Card } from "@/components/card";
import { QuickTimer } from "@/components/quick-timer";
import { Pomodoro } from "@/components/pomodoro";
import { fmtLocal } from "@/lib/profile";
import { Timer, Focus, PlaySquare, BarChart3, ListFilter } from "lucide-react";
import { cn, dateLocal, todayLocal } from "@/lib/utils";

function fmtDur(a: string, b: string | null) {
  const s = ((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 1000;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function Page() {
  const [active, setActive] = useState<Session | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">("stopwatch");

  const refresh = () => {
    api.timeActive().then(setActive).catch(() => {});
    api.timeAll(30).then(setSessions).catch(() => {});
  };
  useEffect(() => {
    refresh();
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      if (p.get("mode") === "pomodoro") setMode("pomodoro");
    }
  }, []);

  const totalToday = sessions
    .filter(s => dateLocal(s.started_at) === todayLocal())
    .reduce((acc, s) => {
      const start = new Date(s.started_at).getTime();
      const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      return acc + (end - start) / 1000;
    }, 0);

  const h = Math.floor(totalToday / 3600);
  const m = Math.floor((totalToday % 3600) / 60);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Timer className="h-6 w-6 text-primary" /> Time & Focus
          </h1>
          <p className="text-sm text-muted-foreground">Track your deep work and manage your sessions.</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Focused Today</div>
          <div className="text-2xl font-semibold tabular-nums text-primary">{h}h {m}m</div>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr] lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden p-0">
            <div className="flex bg-secondary/30 border-b border-border">
              <button 
                onClick={() => setMode("stopwatch")}
                className={cn("flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors", mode === "stopwatch" ? "bg-background border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <PlaySquare className="h-4 w-4" /> Stopwatch
              </button>
              <button 
                onClick={() => setMode("pomodoro")}
                className={cn("flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors", mode === "pomodoro" ? "bg-background border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                <Focus className="h-4 w-4" /> Pomodoro
              </button>
            </div>
            <div className="p-6">
              {mode === "stopwatch" ? (
                <QuickTimer active={active} onDone={refresh} />
              ) : (
                <Pomodoro />
              )}
            </div>
          </Card>
          
          <Card title="Categories Overview">
             <div className="space-y-3">
               {Object.entries(
                 sessions.reduce((acc, s) => {
                   const start = new Date(s.started_at).getTime();
                   const end = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
                   acc[s.category] = (acc[s.category] || 0) + (end - start) / 1000;
                   return acc;
                 }, {} as Record<string, number>)
               ).sort(([,a], [,b]) => b - a).map(([cat, secs]) => {
                 const th = Math.floor(secs / 3600);
                 const tm = Math.floor((secs % 3600) / 60);
                 return (
                   <div key={cat} className="flex items-center justify-between text-sm">
                     <span className="capitalize text-muted-foreground">{cat}</span>
                     <span className="tabular-nums font-medium">{th > 0 ? `${th}h ` : ''}{tm}m</span>
                   </div>
                 );
               })}
             </div>
          </Card>
        </div>

        <Card title="Recent Sessions">
          <div className="divide-y divide-border max-h-[75vh] overflow-y-auto -mx-2 pr-2">
            {sessions.map(s => (
              <div key={s.id} className="group flex items-center justify-between px-3 py-3 hover:bg-secondary/20 rounded-lg transition-colors">
                <div>
                  <div className="font-medium text-base mb-0.5">{s.label}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wider border border-border px-1.5 rounded bg-secondary/30">{s.category}</span>
                    <span>•</span>
                    <span>{fmtLocal(s.started_at)}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-semibold text-lg">{fmtDur(s.started_at, s.ended_at)}</div>
                  {!s.ended_at && (
                    <div className="text-[10px] text-emerald-500 font-medium uppercase tracking-widest animate-pulse">Running</div>
                  )}
                </div>
              </div>
            ))}
            {sessions.length === 0 && <div className="text-sm text-muted-foreground p-10 text-center flex flex-col items-center gap-2"><ListFilter className="h-8 w-8 opacity-20" /> No sessions yet. Start tracking your time!</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
