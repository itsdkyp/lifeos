"use client";
import { useEffect, useState } from "react";
import { api, type Meal } from "@/lib/api";
import { Card } from "@/components/card";
import { Plus, Trash2 } from "lucide-react";
import { fmtLocalTime } from "@/lib/profile";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [day, setDay] = useState(todayStr());
  const [meals, setMeals] = useState<Meal[]>([]);
  const [daily, setDaily] = useState<{ d: string; kcal: number }[]>([]);
  const [range, setRange] = useState(30);

  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState(""); const [c, setC] = useState(""); const [f, setF] = useState("");

  const load = () => {
    api.mealsForDay(day).then(setMeals).catch(() => {});
    api.mealsDaily(range).then(setDaily).catch(() => {});
  };
  useEffect(() => { load(); }, [day, range]);

  async function add() {
    const k = parseInt(kcal, 10);
    if (!name.trim() || !k || k <= 0) return;
    await api.mealAdd({ name, kcal: k, protein_g: +p || undefined, carbs_g: +c || undefined, fat_g: +f || undefined });
    setName(""); setKcal(""); setP(""); setC(""); setF("");
    load();
  }

  const total = meals.reduce((s, m) => s + m.kcal, 0);
  const macros = meals.reduce((a, m) => ({ p: a.p + (m.protein_g ?? 0), c: a.c + (m.carbs_g ?? 0), f: a.f + (m.fat_g ?? 0) }), { p: 0, c: 0, f: 0 });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Meals</h1>
          <p className="text-sm text-muted-foreground">Log what you eat. Not obsessively — just to see the pattern.</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={day} onChange={e => setDay(e.target.value)}
            max={todayStr()} className={inputCls} />
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[2fr_3fr]">
        <Card title={`${day} · ${total} kcal`}>
          <div className="text-xs text-muted-foreground mb-3">
            protein {macros.p.toFixed(0)}g · carbs {macros.c.toFixed(0)}g · fat {macros.f.toFixed(0)}g
          </div>

          <div className="divide-y divide-border max-h-64 overflow-y-auto -mx-2 mb-3">
            {meals.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">Nothing logged for this day.</div>}
            {meals.map(m => (
              <div key={m.id} className="group flex items-center justify-between px-2 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate">{m.name}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtLocalTime(m.ts)}{m.protein_g != null ? ` · ${m.protein_g}p ${m.carbs_g}c ${m.fat_g}f` : ""}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm tabular-nums">{m.kcal} kcal</span>
                  <button onClick={async () => { await api.mealDelete(m.id); load(); }}
                    className="opacity-50 hover:opacity-100 md:opacity-30 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <input value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()}
              placeholder="what did you eat?" className={inputCls + " w-full"} />
            <div className="grid grid-cols-4 gap-2">
              <input value={kcal} onChange={e => setKcal(e.target.value)} placeholder="kcal" type="number" className={inputCls} />
              <input value={p}    onChange={e => setP(e.target.value)}    placeholder="p (g)" type="number" className={inputCls} />
              <input value={c}    onChange={e => setC(e.target.value)}    placeholder="c (g)" type="number" className={inputCls} />
              <input value={f}    onChange={e => setF(e.target.value)}    placeholder="f (g)" type="number" className={inputCls} />
            </div>
            <button onClick={add}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 text-sm hover:opacity-90 flex items-center justify-center gap-1">
              <Plus className="h-4 w-4" /> Add meal
            </button>
          </div>
        </Card>

        <Card title={`Trend · last ${range} days`}>
          <div className="flex justify-end mb-2">
            <div className="inline-flex rounded-lg border border-border bg-card/40 p-0.5 text-xs">
              {[[7,"7d"],[30,"30d"],[90,"90d"]].map(([n,l]) => (
                <button key={n as number} onClick={() => setRange(n as number)}
                  className={`px-3 py-1.5 rounded-md ${range === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="h-64">
            {daily.length ? (
              <ResponsiveContainer>
                <BarChart data={daily.map(x => ({ d: x.d.slice(5), kcal: x.kcal }))} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="d" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="kcal" fill="#f472b6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="text-sm text-muted-foreground text-center pt-16">Nothing logged yet.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}

const inputCls = "rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
