"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

type Phase = "focus" | "break";
const FOCUS = 25 * 60, BREAK = 5 * 60;

export function Pomodoro() {
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    timerRef.current = window.setInterval(() => {
      setRemaining(r => {
        if (r > 1) return r - 1;
        // switch phase
        const next: Phase = phase === "focus" ? "break" : "focus";
        setPhase(next);
        try { new Audio("data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play(); } catch {}
        return next === "focus" ? FOCUS : BREAK;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running, phase]);

  function reset() { setRunning(false); setPhase("focus"); setRemaining(FOCUS); }

  const m = Math.floor(remaining / 60), s = remaining % 60;
  const pct = 1 - remaining / (phase === "focus" ? FOCUS : BREAK);

  return (
    <div className="space-y-3">
      <div className="relative flex items-center justify-center h-24">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="45" strokeWidth="6" fill="none" className="stroke-secondary" />
          <circle cx="50" cy="50" r="45" strokeWidth="6" fill="none"
            strokeLinecap="round" strokeDasharray={2 * Math.PI * 45}
            strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
            className={phase === "focus" ? "stroke-primary" : "stroke-emerald-500"} />
        </svg>
        <div className="text-center">
          <div className="text-2xl font-semibold tabular-nums">{m}:{String(s).padStart(2, "0")}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{phase}</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setRunning(r => !r)}
          className="flex-1 rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 flex items-center justify-center gap-1 hover:opacity-90">
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? "Pause" : "Start"}
        </button>
        <button onClick={reset}
          className="rounded-md bg-secondary/50 border border-border px-3 hover:bg-secondary">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
