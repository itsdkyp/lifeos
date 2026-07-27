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
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-medium">{active.label}</div>
            <div className="text-xs text-muted-foreground">{active.category}</div>
          </div>
          <div className="text-3xl font-semibold tabular-nums">{fmt(secs)}</div>
        </div>
        <button onClick={async () => { await api.timeStop(); onDone(); }}
          className="w-full rounded-md bg-destructive text-destructive-foreground text-sm font-medium py-2 flex items-center justify-center gap-2 hover:opacity-90">
          <Square className="h-4 w-4" /> Stop
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="what are you doing?"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <select value={cat} onChange={e => setCat(e.target.value)}
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none">
        <option>work</option><option>learning</option><option>exercise</option>
        <option>chores</option><option>personal</option>
      </select>
      <button onClick={async () => { if (!label.trim()) return; await api.timeStart(label, cat); setLabel(""); onDone(); }}
        className="w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 flex items-center justify-center gap-2 hover:opacity-90">
        <Play className="h-4 w-4" /> Start
      </button>
    </div>
  );
}
