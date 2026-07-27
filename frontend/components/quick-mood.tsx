"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export function QuickMood({ onDone }: { onDone: () => void }) {
  const [score, setScore] = useState(7);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-4xl font-semibold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">/ 10</span>
      </div>
      <input type="range" min={1} max={10} value={score}
        onChange={e => setScore(+e.target.value)}
        className="w-full accent-primary" />
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="one word (optional)"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      <button disabled={saving}
        onClick={async () => { setSaving(true); try { await api.logMood(score, note); setNote(""); onDone(); } finally { setSaving(false); } }}
        className="w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 hover:opacity-90 disabled:opacity-50">
        Log mood
      </button>
    </div>
  );
}
