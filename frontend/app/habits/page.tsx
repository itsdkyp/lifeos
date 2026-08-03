"use client";
import { useEffect, useState, useMemo } from "react";
import { api, type HabitGrid } from "@/lib/api";
import { Card } from "@/components/card";
import { Plus, Trash2, Flame, CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [grid, setGrid] = useState<HabitGrid | null>(null);
  const [name, setName] = useState("");
  const [viewDays, setViewDays] = useState(30);

  const load = () => api.habitGrid(viewDays).then(setGrid).catch(() => {});
  useEffect(() => { load(); }, [viewDays]);

  // Scroll horizontal grids to the end (Today) when data loads, but allow manual scrolling after
  useEffect(() => {
    if (!grid) return;
    // Slight delay to allow DOM to render the new boxes
    const timer = setTimeout(() => {
      const containers = document.querySelectorAll(".habit-grid-container");
      containers.forEach(el => {
        el.scrollLeft = el.scrollWidth;
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [grid]);

  async function add() {
    if (!name.trim()) return;
    // The backend now randomly assigns a color if none is passed!
    await api.habitAdd({ name, color: undefined });
    setName("");
    load();
  }

  async function toggle(hid: number, day: string, on: boolean) {
    // Optimistic UI update
    setGrid(g => {
      if (!g) return g;
      const idx = g.labels.indexOf(day);
      if (idx === -1) return g;
      return {
        ...g,
        habits: g.habits.map(h => {
          if (h.id !== hid) return h;
          const newMarks = [...h.marks];
          newMarks[idx] = !on;
          return { ...h, marks: newMarks };
        })
      };
    });
    
    if (on) await api.habitUnlog(hid, day); 
    else await api.habitLog(hid, day);
    load();
  }

  const today = todayStr();
  const todayIdx = grid?.labels.indexOf(today) ?? -1;

  // Compute overall consistency for the top KPI
  const { totalConsistency, totalActiveStreak } = useMemo(() => {
    if (!grid || grid.habits.length === 0) return { totalConsistency: 0, totalActiveStreak: 0 };
    const tC = grid.habits.reduce((acc, h) => acc + h.consistency, 0) / grid.habits.length;
    const tS = grid.habits.filter(h => h.streak > 0).length;
    return { totalConsistency: Math.round(tC), totalActiveStreak: tS };
  }, [grid]);

  return (
    <div className="mx-auto max-w-5xl 2xl:max-w-[1600px] space-y-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Habits</h1>
          <p className="text-sm text-muted-foreground">Identity is just repeated behavior.</p>
        </div>
      </header>

      {/* Frictionless Input */}
      <div className="bg-secondary/20 border border-border/50 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
        <div className="flex-1 flex items-center gap-3 w-full bg-background rounded-xl border border-border px-4 py-2 focus-within:border-primary transition-colors">
          <Target className="h-5 w-5 text-muted-foreground" />
          <input value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="What habit do you want to build? (e.g. Meditate for 10m)"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 font-medium" />
        </div>
        <button onClick={add} disabled={!name.trim()}
          className="w-full sm:w-auto rounded-xl bg-primary text-primary-foreground px-6 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm flex items-center justify-center gap-2">
          <Plus className="h-4 w-4" /> Create
        </button>
      </div>

      {(!grid || grid.habits.length === 0) ? (
        <div className="text-sm text-muted-foreground py-12 text-center flex flex-col items-center gap-2">
          <Target className="h-8 w-8 opacity-20" />
          <p>No habits tracked yet.</p>
          <p className="text-xs">Start with something trivially easy, like "Drink 1 glass of water".</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
          
          {/* Today's Action Center */}
          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2">
                Today's Actions
              </h2>
              <div className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground bg-secondary/50 px-2 py-1 rounded-md">
                {totalActiveStreak}/{grid.habits.length} Active
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              {grid.habits.map(h => {
                const isDoneToday = todayIdx >= 0 ? h.marks[todayIdx] : false;
                return (
                  <button 
                    key={h.id}
                    onClick={() => toggle(h.id, today, isDoneToday)}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 text-left w-full group overflow-hidden relative",
                      isDoneToday ? "bg-secondary/40 border-border/50 shadow-none" : "bg-card border-border shadow-sm hover:border-primary/50 hover:shadow-md"
                    )}
                  >
                    {/* Background tint based on color when done */}
                    {isDoneToday && (
                      <div className="absolute inset-0 opacity-[0.03] transition-opacity" style={{ backgroundColor: h.color }} />
                    )}

                    <div className="flex items-center gap-3 relative z-10">
                      <div 
                        className={cn("h-6 w-6 rounded-full flex items-center justify-center border-2 transition-colors", 
                          isDoneToday ? "border-transparent text-white" : "border-muted-foreground/30 text-transparent group-hover:border-primary/50"
                        )}
                        style={{ backgroundColor: isDoneToday ? h.color : "transparent" }}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className={cn("text-sm font-semibold transition-colors", isDoneToday && "text-muted-foreground line-through decoration-muted-foreground/30")}>
                          {h.name}
                        </div>
                        {h.streak > 0 && (
                          <div className={cn("text-[10px] font-bold uppercase tracking-wider flex items-center gap-0.5 mt-0.5 transition-colors", isDoneToday ? "text-amber-500/70" : "text-amber-500")}>
                            <Flame className="h-3 w-3" /> {h.streak} Day Streak
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-2xl border border-border bg-card/40 px-5 py-4 mt-6">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Overall Consistency</div>
              <div className="flex items-end gap-2 mt-1">
                <div className="text-3xl font-semibold tabular-nums leading-none">{totalConsistency}%</div>
              </div>
              <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden mt-3">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalConsistency}%` }} />
              </div>
            </div>
          </div>

          {/* History Grid (GitHub Style) */}
          <div className="space-y-4 min-w-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                Consistency Heatmap
              </h2>
              <select value={viewDays} onChange={e => setViewDays(Number(e.target.value))}
                className="text-xs bg-secondary/50 border border-border rounded-md px-2 py-1 outline-none text-muted-foreground">
                <option value={14}>14 Days</option>
                <option value={30}>30 Days</option>
                <option value={60}>60 Days</option>
                <option value={90}>90 Days</option>
              </select>
            </div>
            
            <Card className="p-0 overflow-hidden">
              <div className="divide-y divide-border/50">
                {grid.habits.map(h => (
                  <div key={h.id} className="group p-4 sm:p-5 hover:bg-secondary/10 transition-colors">
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-3 w-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: h.color }} />
                        <span className="text-sm font-medium truncate">{h.name}</span>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right hidden sm:block">
                          <div className="text-xs font-semibold tabular-nums">{h.consistency}%</div>
                          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Rate</div>
                        </div>
                        <button onClick={async () => { if(confirm(`Delete habit "${h.name}"?`)) { await api.habitDelete(h.id); load(); } }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    
                    {/* The Grid */}
                    <div 
                      className={cn(
                        "no-scrollbar pb-2 pt-1.5 px-1.5",
                        viewDays >= 60 
                          ? "flex flex-wrap gap-[3px] sm:gap-1" 
                          : "flex gap-[3px] sm:gap-1 overflow-x-auto habit-grid-container"
                      )}
                    >
                      {/* Oldest on the left/top, Today on the far right/bottom */}
                      {grid.labels.map((d, i) => {
                        const on = h.marks[i];
                        const isToday = d === today;
                        const isCompact = viewDays >= 60;
                        
                        return (
                          <button 
                            key={d} 
                            onClick={() => toggle(h.id, d, on)}
                            title={`${d}${on ? ' (Done)' : ''}`}
                            className={cn(
                              "rounded-[4px] sm:rounded-md transition-all shrink-0 hover:scale-110",
                              isCompact ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-5 h-5 sm:w-6 sm:h-6",
                              isToday ? "ring-[1.5px] ring-primary ring-offset-[1.5px] ring-offset-background z-10 mx-[1.5px]" : "border border-transparent"
                            )}
                            style={{ 
                              backgroundColor: on ? h.color : undefined,
                              opacity: on ? 1 : undefined 
                            }}
                          >
                            {/* Empty state styling handled via CSS classes to avoid inline style overrides */}
                            {!on && <div className="w-full h-full bg-secondary/60 rounded-[3px] sm:rounded-[5px]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

        </div>
      )}
    </div>
  );
}
