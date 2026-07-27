"use client";
import { useEffect, useState } from "react";
import { api, type HabitGrid } from "@/lib/api";
import { Card } from "@/components/card";
import { Plus, Trash2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [grid, setGrid] = useState<HabitGrid | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#60a5fa");

  const load = () => api.habitGrid(30).then(setGrid).catch(() => {});
  useEffect(() => { load(); }, []);

  async function add() {
    if (!name.trim()) return;
    await api.habitAdd({ name, color });
    setName("");
    load();
  }
  async function toggle(hid: number, day: string, on: boolean) {
    if (on) await api.habitUnlog(hid, day); else await api.habitLog(hid, day);
    load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
        <p className="text-sm text-muted-foreground">Small things done often. Consistency &gt; streaks.</p>
      </header>

      <Card>
        <div className="flex flex-wrap gap-2">
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="e.g. read 20 min · walk · meditate"
            className="flex-1 min-w-[200px] rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input type="color" value={color} onChange={e => setColor(e.target.value)}
            className="h-10 w-10 rounded-md border border-border bg-transparent cursor-pointer" />
          <button onClick={add}
            className="rounded-md bg-primary text-primary-foreground px-4 hover:opacity-90 flex items-center gap-1 text-sm">
            <Plus className="h-4 w-4" /> Add
          </button>
        </div>
      </Card>

      <Card title="Last 30 days">
        {(!grid || grid.habits.length === 0) ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No habits yet. Start with one — the simplest possible.
          </div>
        ) : (
          <div className="space-y-4">
            {grid.habits.map(h => (
              <div key={h.id} className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: h.color }} />
                    <span className="text-sm font-medium truncate">{h.name}</span>
                    {h.streak > 0 && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-500 shrink-0">
                        <Flame className="h-3 w-3" /> {h.streak}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums">{h.consistency}%</span>
                    <button onClick={async () => { await api.habitDelete(h.id); load(); }}
                      className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${grid.labels.length}, minmax(0,1fr))` }}>
                  {grid.labels.map((d, i) => {
                    const on = h.marks[i];
                    const isToday = d === todayStr();
                    return (
                      <button key={d} onClick={() => toggle(h.id, d, on)}
                        title={d}
                        className={cn(
                          "aspect-square rounded-[3px] transition",
                          isToday && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                        )}
                        style={{ background: on ? h.color : "hsl(var(--secondary))", opacity: on ? 1 : 0.4 }} />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
