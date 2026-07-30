"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

import { api } from "@/lib/api";

type Phase = "focus" | "break";
const FOCUS = 25 * 60, BREAK = 5 * 60;

function playAlarm() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      const startTime = ctx.currentTime + i * 0.3;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(1, startTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.2);
      osc.start(startTime);
      osc.stop(startTime + 0.2);
    }
  } catch (e) {
    console.error("Audio failed", e);
  }
}

export function Pomodoro({ onDone }: { onDone?: () => void }) {
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(FOCUS);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState("");

  // Keep label + onDone in refs so the interval effect doesn't re-run every keystroke.
  const labelRef = useRef(label);
  useEffect(() => { labelRef.current = label; }, [label]);
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  // Interval only depends on `running`. React 19 StrictMode double-invoke is safe:
  // no side effects inside the setState updater, and a completion "sentinel" 
  // (remaining === 0) is handled in a separate effect below.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemaining(r => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  // Phase transitions happen here — outside any setState updater, runs once per tick,
  // safe from StrictMode double-fire (guarded by remaining === 0 + phase state).
  useEffect(() => {
    if (remaining !== 0) return;
    const wasFocus = phase === "focus";
    playAlarm();
    if (wasFocus && labelRef.current.trim()) {
      api.timeLog(labelRef.current, FOCUS).then(() => onDoneRef.current?.()).catch(() => {});
    }
    const next: Phase = wasFocus ? "break" : "focus";
    setPhase(next);
    setRemaining(next === "focus" ? FOCUS : BREAK);
  }, [remaining, phase]);

  function reset() {
    if (phase === "focus" && labelRef.current.trim()) {
      const elapsed = FOCUS - remaining;
      if (elapsed >= 60) {
        api.timeLog(labelRef.current, elapsed).then(() => onDoneRef.current?.()).catch(() => {});
      }
    }
    setRunning(false);
    setPhase("focus");
    setRemaining(FOCUS);
  }

  const m = Math.floor(remaining / 60), s = remaining % 60;
  const pct = 1 - remaining / (phase === "focus" ? FOCUS : BREAK);

  return (
    <div className="space-y-6 flex flex-col items-center">
      <div className="w-full">
        <input 
          value={label} 
          onChange={e => setLabel(e.target.value)} 
          placeholder="What are you focusing on?"
          className="w-full bg-transparent border-b border-border/50 px-2 py-2 text-center text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" 
        />
      </div>

      <div className="relative flex items-center justify-center h-64 w-64 sm:h-80 sm:w-80">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="45" strokeWidth="3" fill="none" className="stroke-secondary/50" />
          <circle cx="50" cy="50" r="45" strokeWidth="3" fill="none"
            strokeLinecap="round" strokeDasharray={2 * Math.PI * 45}
            strokeDashoffset={2 * Math.PI * 45 * (1 - pct)}
            className={phase === "focus" ? "stroke-primary transition-all duration-1000 ease-linear" : "stroke-emerald-500 transition-all duration-1000 ease-linear"} />
        </svg>
        <div className="text-center">
          <div className="text-6xl sm:text-7xl font-semibold tabular-nums tracking-tighter">
            {m}:{String(s).padStart(2, "0")}
          </div>
          <div className={cn("text-xs sm:text-sm uppercase tracking-widest mt-2 font-medium", phase === "focus" ? "text-primary" : "text-emerald-500")}>
            {phase}
          </div>
        </div>
      </div>
      
      <div className="flex gap-3 w-full max-w-[240px]">
        <button onClick={() => setRunning(r => !r)}
          className="flex-1 rounded-full bg-primary text-primary-foreground text-sm font-medium py-3 flex items-center justify-center gap-1.5 hover:opacity-90 shadow-sm transition-transform active:scale-95">
          {running ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          {running ? "Pause" : "Start"}
        </button>
        <button onClick={reset}
          className="rounded-full bg-secondary border border-border px-5 hover:bg-secondary/80 shadow-sm transition-transform active:scale-95">
          <RotateCcw className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
