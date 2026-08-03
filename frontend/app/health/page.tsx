"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Stats, type Summary, type SleepEntry, type Meal } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/card";
import { Heart, Moon, Scale, Apple, Activity, ArrowRight, Plus, Droplets, CheckCircle2, Trash2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { fmtLocalTime, useProfile } from "@/lib/profile";
import { cn } from "@/lib/utils";

const grid = "hsl(var(--border))";
const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const tooltip = { background: "hsl(var(--card))", border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [s, setS] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sleepList, setSleepList] = useState<SleepEntry[]>([]);
  const [weight, setWeight] = useState<{ day: string; kg: number }[]>([]);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [range, setRange] = useState(30);
  const { profile } = useProfile();

  useEffect(() => {
    api.summary(range).then(setS).catch(() => {});
    api.stats(range).then(setStats).catch(() => {});
    api.sleepList(range).then(setSleepList).catch(() => {});
    api.weightList(range).then(setWeight).catch(() => {});
    api.mealsForDay(todayStr()).then(setMeals).catch(() => {});
  }, [range]);

  const target = profile?.sleep_target_hours ?? 8;

  return (
    <div className="mx-auto max-w-6xl 2xl:max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" /> Health
          </h1>
          <p className="text-sm text-muted-foreground">Sleep, weight, meals, and vitals in one place.</p>
        </div>
        <RangeToggle range={range} setRange={setRange} />
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Moon} label="Sleep last night"
          value={s?.sleep.last?.hours != null ? `${s.sleep.last.hours}h` : "—"}
          sub={`target ${target}h`}
          tone={s?.sleep.last?.hours == null ? "default" :
                s.sleep.last.hours >= target ? "good" :
                s.sleep.last.hours >= target - 1 ? "default" : "warn"} />
        <StatCard icon={Scale} label="Weight"
          value={s?.weight?.last != null ? `${s.weight.last} kg` : "—"}
          sub={s?.weight?.delta != null ? `${s.weight.delta > 0 ? "+" : ""}${s.weight.delta} kg ${range}d` : "log weight"} />
        <StatCard icon={Apple} label="Calories today"
          value={s?.calories?.today ?? 0}
          sub={s?.calories?.avg ? `avg ${s.calories.avg} kcal` : "log meals"} />
        <StatCard icon={Droplets} label="Water (coming soon)"
          value="—"
          sub="quick add" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-6">
          <Card className="overflow-hidden p-0 flex flex-col">
             <div className="px-4 pt-4 pb-3 border-b border-border/50 bg-secondary/10">
               <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Log Vitals</h3>
             </div>
             <VitalsLog onDone={() => {
                api.summary(range).then(setS).catch(() => {});
                api.stats(range).then(setStats).catch(() => {});
                api.sleepList(range).then(setSleepList).catch(() => {});
                api.weightList(range).then(setWeight).catch(() => {});
                api.mealsForDay(todayStr()).then(setMeals).catch(() => {});
             }} />
          </Card>
          
          <Card title="Today's macros">
            <div className="space-y-4">
              <MacroBar label="Protein" current={meals.reduce((a, m) => a + (m.protein_g ?? 0), 0)} target={150} color="bg-blue-500" />
              <MacroBar label="Carbs" current={meals.reduce((a, m) => a + (m.carbs_g ?? 0), 0)} target={250} color="bg-amber-500" />
              <MacroBar label="Fat" current={meals.reduce((a, m) => a + (m.fat_g ?? 0), 0)} target={70} color="bg-rose-500" />
              <div className="pt-2 text-xs text-muted-foreground text-right border-t border-border mt-4">
                Total Calories: <b className="text-foreground">{meals.reduce((s, m) => s + m.kcal, 0)}</b> / 2000
              </div>
            </div>
            {meals.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border divide-y divide-border -mx-2">
                <div className="px-2 pb-2 text-[10px] uppercase font-semibold text-muted-foreground">Today's Meals</div>
                {meals.map(m => (
                  <div key={m.id} className="flex flex-col gap-1 px-2 py-2 text-sm group">
                    <div className="flex items-center justify-between">
                      <div className="font-medium flex items-center gap-1.5">
                        {m.name} 
                        <span className="text-[9px] uppercase border border-border px-1 rounded text-muted-foreground">{m.meal_type || "snack"}</span>
                      </div>
                      <div className="tabular-nums font-semibold flex items-center gap-2">
                        {m.kcal} kcal
                        <button onClick={async () => { await api.mealDelete(m.id); api.mealsForDay(todayStr()).then(setMeals).catch(() => {}); }}
                          className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] text-muted-foreground">{fmtLocalTime(m.ts)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {m.protein_g != null ? `${m.protein_g}p ${m.carbs_g}c ${m.fat_g}f` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Health Trends">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="h-48">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Moon className="h-3 w-3"/> Sleep</div>
                  {stats?.sleep ? (
                    <ResponsiveContainer>
                      <LineChart data={stats.labels.map((d, i) => ({ d: d.slice(5), sleep: stats.sleep![i] }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                        <Line type="monotone" dataKey="sleep" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-muted-foreground h-full flex items-center justify-center">No data</div>}
                </div>
                <div className="h-48">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Scale className="h-3 w-3"/> Weight</div>
                  {stats?.weight ? (
                    <ResponsiveContainer>
                      <LineChart data={stats.labels.map((d, i) => ({ d: d.slice(5), kg: stats.weight![i] }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                        <YAxis domain={["dataMin - 1", "dataMax + 1"]} hide />
                        <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                        <Line type="monotone" dataKey="kg" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-muted-foreground h-full flex items-center justify-center">No data</div>}
                </div>
                <div className="h-48">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Apple className="h-3 w-3"/> Calories</div>
                  {stats?.kcal ? (
                    <ResponsiveContainer>
                      <BarChart data={stats.labels.map((d, i) => ({ d: d.slice(5), kcal: stats.kcal![i] }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="kcal" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-muted-foreground h-full flex items-center justify-center">No data</div>}
                </div>
                <div className="h-48">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Heart className="h-3 w-3"/> Mood</div>
                  {stats?.mood ? (
                    <ResponsiveContainer>
                      <LineChart data={stats.labels.map((d, i) => ({ d: d.slice(5), mood: stats.mood![i] }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                        <YAxis domain={[1, 10]} hide />
                        <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                        <Line type="monotone" dataKey="mood" stroke="#f472b6" strokeWidth={2} dot={false} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-muted-foreground h-full flex items-center justify-center">No data</div>}
                </div>
                <div className="h-48 md:col-span-2">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Droplets className="h-3 w-3"/> Water (ml)</div>
                  {stats?.water ? (
                    <ResponsiveContainer>
                      <BarChart data={stats.labels.map((d, i) => ({ d: d.slice(5), water: stats.water![i] }))}>
                        <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                        <Bar dataKey="water" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="text-xs text-muted-foreground h-full flex items-center justify-center">No data</div>}
                </div>
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MacroBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = Math.min(100, Math.max(0, (current / target) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground"><b className="text-foreground">{Math.round(current)}g</b> / {target}g</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function VitalsLog({ onDone }: { onDone: () => void }) {
  const [tab, setTab] = useState<"sleep" | "weight" | "meal" | "water" | "mood">("sleep");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Sleep state
  const [hours, setHours] = useState("");
  const [quality, setQuality] = useState("");

  // Weight state
  const [kg, setKg] = useState("");

  // Meal state
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<"breakfast"|"lunch"|"dinner"|"snack">("snack");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState(""); const [c, setC] = useState(""); const [f, setF] = useState("");
  const [estimating, setEstimating] = useState(false);

  // Water state
  const [waterAmount, setWaterAmount] = useState("250");

  // Mood state
  const [energy, setEnergy] = useState("5");
  const [valence, setValence] = useState("5");
  const [moodTag, setMoodTag] = useState("");

  async function handleSave(fn: () => Promise<any>, clear: () => void) {
    setStatus("saving");
    try {
      await fn();
      clear();
      onDone();
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("idle");
    }
  }

  function logSleep() {
    if (!hours) return;
    handleSave(
      () => api.sleepSave(todayStr(), { hours: parseFloat(hours), quality: parseInt(quality) || undefined }),
      () => { setHours(""); setQuality(""); }
    );
  }

  function logWeight() {
    if (!kg) return;
    handleSave(
      () => api.weightAdd(parseFloat(kg)),
      () => { setKg(""); }
    );
  }

  function logMeal() {
    if (!name || !kcal) return;
    handleSave(
      () => api.mealAdd({ name, meal_type: mealType, kcal: parseInt(kcal), protein_g: +p || undefined, carbs_g: +c || undefined, fat_g: +f || undefined }),
      () => { setName(""); setKcal(""); setP(""); setC(""); setF(""); }
    );
  }

  async function estimateMacros() {
    if (!name.trim() || estimating) return;
    setEstimating(true);
    try {
      const res = await api.mealEstimate(name);
      if (res.ok && res.data) {
        setKcal(res.data.kcal?.toString() || "");
        setP(res.data.protein_g?.toString() || "");
        setC(res.data.carbs_g?.toString() || "");
        setF(res.data.fat_g?.toString() || "");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEstimating(false);
    }
  }

  function logWater() {
    const ml = parseInt(waterAmount);
    if (!ml) return;
    handleSave(
      () => api.waterAdd(ml),
      () => {} // Leave amount selected for fast repeated logging
    );
  }

  function logMood() {
    const eng = parseInt(energy);
    const val = parseInt(valence);
    if (!eng || !val) return;
    handleSave(
      () => api.mood2dLog({ energy: eng, valence: val, tag: moodTag }),
      () => { setMoodTag(""); }
    );
  }

  const inputCls = "w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground/50 transition-colors";

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-border/50 bg-secondary/20 overflow-x-auto no-scrollbar">
        <button onClick={() => setTab("sleep")} className={`px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${tab === "sleep" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Sleep</button>
        <button onClick={() => setTab("weight")} className={`px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${tab === "weight" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Weight</button>
        <button onClick={() => setTab("meal")} className={`px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${tab === "meal" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Meal</button>
        <button onClick={() => setTab("water")} className={`px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${tab === "water" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Water</button>
        <button onClick={() => setTab("mood")} className={`px-4 py-3 text-xs font-medium uppercase tracking-widest transition-colors whitespace-nowrap ${tab === "mood" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground hover:text-foreground"}`}>Mood</button>
      </div>
      <div className="p-4">
        {tab === "sleep" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Hours</label>
                <input type="number" step="0.5" value={hours} onChange={e => setHours(e.target.value)} placeholder="8.0" className={inputCls} />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Quality (1-10)</label>
                <input type="number" min="1" max="10" value={quality} onChange={e => setQuality(e.target.value)} placeholder="8" className={inputCls} />
              </div>
            </div>
            <button disabled={status !== "idle"} onClick={logSleep} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2 transition-all">
               {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save Sleep"}
            </button>
          </div>
        )}
        
        {tab === "weight" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Weight (kg)</label>
              <input type="number" step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="72.5" className={inputCls} />
            </div>
            <button disabled={status !== "idle"} onClick={logWeight} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2 transition-all">
               {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save Weight"}
            </button>
          </div>
        )}
        
        {tab === "meal" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex gap-2">
              <select value={mealType} onChange={e => setMealType(e.target.value as any)} className="w-1/3 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-colors">
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
              <div className="relative flex-1">
                <input value={name} onChange={e => setName(e.target.value)} placeholder="What did you eat?" className={inputCls} />
                <button onClick={estimateMacros} disabled={estimating || !name.trim()} title="Auto-estimate calories"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
                  <Activity className={cn("h-4 w-4", estimating && "animate-pulse text-primary")} />
                </button>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground italic px-1">
              Type your meal and click the <Activity className="inline h-3 w-3 mx-0.5" /> icon to let AI auto-estimate calories and macros.
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Kcal</label><input type="number" value={kcal} onChange={e => setKcal(e.target.value)} placeholder="450" className={inputCls} /></div>
              <div><label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">P (g)</label><input type="number" value={p} onChange={e => setP(e.target.value)} placeholder="30" className={inputCls} /></div>
              <div><label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">C (g)</label><input type="number" value={c} onChange={e => setC(e.target.value)} placeholder="40" className={inputCls} /></div>
              <div><label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">F (g)</label><input type="number" value={f} onChange={e => setF(e.target.value)} placeholder="15" className={inputCls} /></div>
            </div>
            <button disabled={status !== "idle"} onClick={logMeal} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2 transition-all">
               {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save Meal"}
            </button>
          </div>
        )}

        {tab === "water" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Amount (ml)</label>
              <div className="flex gap-2">
                <button onClick={() => setWaterAmount("250")} className={`flex-1 py-1.5 rounded-md text-xs border ${waterAmount === "250" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>250ml</button>
                <button onClick={() => setWaterAmount("500")} className={`flex-1 py-1.5 rounded-md text-xs border ${waterAmount === "500" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>500ml</button>
                <button onClick={() => setWaterAmount("1000")} className={`flex-1 py-1.5 rounded-md text-xs border ${waterAmount === "1000" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>1L</button>
              </div>
              <input type="number" step="10" value={waterAmount} onChange={e => setWaterAmount(e.target.value)} placeholder="250" className={cn(inputCls, "mt-2")} />
            </div>
            <button disabled={status !== "idle"} onClick={logWater} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2 transition-all">
               {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Add Water"}
            </button>
          </div>
        )}

        {tab === "mood" && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block flex justify-between">
                  <span>Energy</span> <span className="text-foreground">{energy}</span>
                </label>
                <input type="range" min="1" max="10" value={energy} onChange={e => setEnergy(e.target.value)} className="w-full accent-primary" />
              </div>
              <div>
                <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block flex justify-between">
                  <span>Mood / Valence</span> <span className="text-foreground">{valence}</span>
                </label>
                <input type="range" min="1" max="10" value={valence} onChange={e => setValence(e.target.value)} className="w-full accent-primary" />
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Tag (optional)</label>
              <input value={moodTag} onChange={e => setMoodTag(e.target.value)} placeholder="e.g., anxious, focused, calm" className={inputCls} />
            </div>
            <button disabled={status !== "idle"} onClick={logMood} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2 transition-all">
               {status === "saving" ? "Saving..." : status === "saved" ? "Saved ✓" : "Save Mood"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      {label} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

function RangeToggle({ range, setRange }: { range: number; setRange: (n: number) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card/40 p-0.5 text-xs">
      {[[7,"7d"],[30,"30d"],[90,"90d"],[365,"1y"]].map(([n,l]) => (
        <button key={n as number} onClick={() => setRange(n as number)}
          className={`px-3 py-1.5 rounded-md ${range === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
