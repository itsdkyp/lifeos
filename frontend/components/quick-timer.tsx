"use client";
import { useEffect, useState } from "react";
import { api, type Session } from "@/lib/api";
import { Play, Square } from "lucide-react";

function fmt(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function QuickTimer({ active, onDone }: { active: Session | null; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [cat, setCat] = useState("work");
  const [tick, setTick] = useState(0);

  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  if (active) {
    const secs = (Date.now() - new Date(active.started_at).getTime()) / 1000;
    return (
      <div className="space-y-6 flex flex-col items-center py-8">
        <div className="text-center space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">{active.category}</div>
          <div className="text-lg font-medium">{active.label}</div>
        </div>
        <div className="text-6xl sm:text-7xl font-semibold tabular-nums tracking-tighter text-primary">
          {fmt(secs)}
        </div>
        <button onClick={async () => { await api.timeStop(); onDone(); }}
          className="w-full max-w-[240px] rounded-full bg-destructive text-destructive-foreground text-sm font-medium py-3 flex items-center justify-center gap-2 hover:opacity-90 shadow-sm transition-transform active:scale-95">
          <Square className="h-5 w-5" /> Stop
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-8 max-w-sm mx-auto">
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="What are you doing?"
        onKeyDown={e => {
          if (e.key === "Enter" && label.trim()) {
            api.timeStart(label, cat).then(() => {
              setLabel("");
              onDone();
            });
          }
        }}
        className="w-full bg-transparent border-b border-border/50 px-2 py-3 text-center text-lg outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
      <select value={cat} onChange={e => setCat(e.target.value)}
        className="w-full rounded-md bg-secondary/30 border border-border px-3 py-3 text-sm outline-none cursor-pointer">
        <option>work</option><option>learning</option><option>exercise</option>
        <option>chores</option><option>personal</option>
      </select>
      <button onClick={async () => { if (!label.trim()) return; await api.timeStart(label, cat); setLabel(""); onDone(); }}
        className="w-full rounded-full bg-primary text-primary-foreground text-sm font-medium py-3 flex items-center justify-center gap-2 hover:opacity-90 shadow-sm transition-transform active:scale-95 mt-4">
        <Play className="h-5 w-5" /> Start Stopwatch
      </button>
    </div>
  );
}
