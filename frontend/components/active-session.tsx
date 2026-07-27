"use client";
import { useEffect, useState } from "react";
import { api, type Session } from "@/lib/api";
import { Square, Timer as TimerIcon } from "lucide-react";

function fmtElapsed(startIso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function ActiveSession() {
  const [active, setActive] = useState<Session | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const load = () => api.timeActive().then(setActive).catch(() => {});
    load();
    const poll = setInterval(load, 10_000);
    const clock = setInterval(() => tick(t => t + 1), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  if (!active) return null;

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 backdrop-blur px-5 py-4 flex items-center justify-between gap-3">
      <div className="min-w-0 flex items-center gap-3">
          <div className="relative shrink-0">
            <TimerIcon className="h-5 w-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Tracking</div>
          <div className="font-medium truncate">{active.label}<span className="ml-2 text-xs text-muted-foreground">· {active.category}</span></div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-2xl font-semibold tabular-nums">{fmtElapsed(active.started_at)}</div>
        <button onClick={async () => { await api.timeStop(); setActive(null); }}
          className="rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive px-3 py-1.5 text-xs flex items-center gap-1">
          <Square className="h-3.5 w-3.5" /> Stop
        </button>
      </div>
    </div>
  );
}
