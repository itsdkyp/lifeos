"use client";
import { useEffect, useState } from "react";
import { api, type Session } from "@/lib/api";
import { Card } from "@/components/card";
import { QuickTimer } from "@/components/quick-timer";
import { fmtLocal } from "@/lib/profile";

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
  const refresh = () => {
    api.timeActive().then(setActive).catch(() => {});
    api.timeAll(30).then(setSessions).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Time</h1>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <Card title="Timer"><QuickTimer active={active} onDone={refresh} /></Card>
        <Card title="Last 30 days">
          <div className="divide-y divide-border max-h-[70vh] overflow-y-auto -mx-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between px-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.category} · {fmtLocal(s.started_at)}</div>
                </div>
                <div className="tabular-nums text-sm">{fmtDur(s.started_at, s.ended_at)}</div>
              </div>
            ))}
            {sessions.length === 0 && <div className="text-sm text-muted-foreground p-6 text-center">No sessions yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
