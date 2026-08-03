"use client";
import { useState } from "react";
import type { Stats } from "@/lib/api";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c", "#cbd5e1", "#818cf8"];
const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const grid = "hsl(var(--border))";
const tooltip = { background: "hsl(var(--card))", border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" };

export function StatsCharts({ stats }: { stats: Stats | null }) {
  const [tab, setTab] = useState<"mood" | "sleep" | "weight" | "work" | "calories" | "spend" | "categories">("mood");

  if (!stats) return <div className="text-sm text-muted-foreground py-8 text-center animate-pulse">Loading charts…</div>;

  const data = stats.labels.map((d, i) => ({
    d: d.slice(5),
    spend: stats.spend[i],
    mood: stats.mood[i],
    hours: stats.hours[i],
    weight: stats.weight?.[i] ?? null,
    kcal: stats.kcal?.[i] ?? 0,
    sleep: stats.sleep?.[i] ?? null,
  }));
  const cats = stats.categories.labels.map((label, i) => ({ name: label, value: stats.categories.values[i] })).sort((a, b) => b.value - a.value);
  const hasWeight = data.some(x => x.weight != null);
  const hasKcal   = data.some(x => x.kcal > 0);
  const hasSleep  = data.some(x => x.sleep != null);

  const TABS = [
    { id: "mood", label: "Mood" },
    { id: "sleep", label: "Sleep", show: hasSleep },
    { id: "weight", label: "Weight", show: hasWeight },
    { id: "work", label: "Deep Work" },
    { id: "calories", label: "Calories", show: hasKcal },
    { id: "spend", label: "Daily Spend" },
    { id: "categories", label: "Spend Categories" },
  ].filter(t => t.show !== false);

  return (
    <div className="flex flex-col h-[350px] md:h-[300px] lg:h-[350px] 2xl:h-[420px]">
      <div className="flex overflow-x-auto no-scrollbar border-b border-border/50 pb-px mb-4 shrink-0">
        {TABS.map(t => (
          <button 
            key={t.id} 
            onClick={() => setTab(t.id as any)}
            className={cn(
              "px-4 py-2 text-xs font-semibold uppercase tracking-widest whitespace-nowrap transition-colors",
              tab === t.id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 w-full relative">
        {tab === "mood" && (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis domain={[1, 10]} tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ stroke: grid }} />
              <Line type="basis" dataKey="mood" stroke="#f472b6" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#f472b6", stroke: "hsl(var(--card))", strokeWidth: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === "sleep" && hasSleep && (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis domain={[0, 12]} tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ stroke: grid }} />
              <Line type="basis" dataKey="sleep" stroke="#a78bfa" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#a78bfa", stroke: "hsl(var(--card))", strokeWidth: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === "weight" && hasWeight && (
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ stroke: grid }} />
              <Line type="monotone" dataKey="weight" stroke="#22d3ee" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: "#22d3ee", stroke: "hsl(var(--card))", strokeWidth: 2 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        )}

        {tab === "work" && (
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.5 }} />
              <Bar dataKey="hours" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === "calories" && hasKcal && (
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.5 }} />
              <Bar dataKey="kcal" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === "spend" && (
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} dy={10} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: 'hsl(var(--secondary))', opacity: 0.5 }} />
              <Bar dataKey="spend" fill="#34d399" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}

        {tab === "categories" && cats.length > 0 && (
          <div className="flex flex-col md:flex-row items-center h-full w-full gap-4">
            <div className="h-[250px] md:h-full w-full md:w-1/2 shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={cats} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}
                    label={({ percent }) => percent && percent > 0.05 ? `${Math.round(percent * 100)}%` : ""}
                    labelLine={false}
                    stroke="hsl(var(--card))">
                    {cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} formatter={(v: number) => v.toFixed(2)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            {/* Custom Scrollable Legend to prevent overflow */}
            <div className="w-full md:w-1/2 flex-1 max-h-[150px] md:max-h-full overflow-y-auto pr-2 no-scrollbar">
              <div className="space-y-1.5">
                {cats.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="truncate text-muted-foreground">{c.name}</span>
                    </div>
                    <span className="tabular-nums font-medium pl-2">{c.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
