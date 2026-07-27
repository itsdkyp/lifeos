"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Stats, type Summary, type SleepEntry, type Meal } from "@/lib/api";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/card";
import { Heart, Moon, Scale, Apple, Activity, ArrowRight } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { fmtLocalTime, useProfile } from "@/lib/profile";

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
    <div className="mx-auto max-w-6xl space-y-6">
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
        <StatCard icon={Moon} label={`Sleep avg ${range}d`}
          value={s?.sleep.avg7 != null ? `${s.sleep.avg7.toFixed(1)}h` : "—"}
          sub="rolling average" />
        <StatCard icon={Scale} label="Weight"
          value={s?.weight?.last != null ? `${s.weight.last} kg` : "—"}
          sub={s?.weight?.delta != null ? `${s.weight.delta > 0 ? "+" : ""}${s.weight.delta} kg ${range}d` : ""} />
        <StatCard icon={Apple} label="Calories today"
          value={s?.calories?.today ?? 0}
          sub={s?.calories?.avg ? `avg ${s.calories.avg} kcal` : "log meals"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sleep hours">
          <div className="h-56">
            {stats?.sleep && (
              <ResponsiveContainer>
                <LineChart data={stats.labels.map((d, i) => ({ d: d.slice(5), sleep: stats.sleep![i] }))}
                  margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                  <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 12]} tick={tick} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                  <Line type="monotone" dataKey="sleep" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Weight (kg)">
          <div className="h-56">
            {stats?.weight && (
              <ResponsiveContainer>
                <LineChart data={stats.labels.map((d, i) => ({ d: d.slice(5), kg: stats.weight![i] }))}
                  margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                  <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={tick} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                  <Line type="monotone" dataKey="kg" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Calories">
          <div className="h-56">
            {stats?.kcal && (
              <ResponsiveContainer>
                <BarChart data={stats.labels.map((d, i) => ({ d: d.slice(5), kcal: stats.kcal![i] }))}
                  margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={grid} strokeDasharray="3 3" />
                  <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="kcal" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Today's meals">
          <div className="divide-y divide-border -mx-2">
            {meals.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">No meals logged today.</div>}
            {meals.map(m => (
              <div key={m.id} className="flex items-center justify-between px-2 py-2 text-sm">
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtLocalTime(m.ts)}</div>
                </div>
                <div className="tabular-nums text-sm">{m.kcal} kcal</div>
              </div>
            ))}
            <div className="pt-2 text-xs text-muted-foreground text-right">
              Total: <b className="text-foreground">{meals.reduce((s, m) => s + m.kcal, 0)} kcal</b>
            </div>
          </div>
          <SubLink href="/meals" label="Log meals" />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Sleep log">
          <SubLink href="/weight" label="See all weigh-ins" />
          <div className="mt-2 divide-y divide-border -mx-2">
            {sleepList.slice(0, 5).map(x => (
              <div key={x.day} className="flex items-center justify-between px-2 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">{x.day.slice(5)}</span>
                <span className="tabular-nums">{x.hours?.toFixed(1) ?? "—"}h · q{x.quality ?? "?"}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Weight log">
          <SubLink href="/weight" label="Add / edit" />
          <div className="mt-2 divide-y divide-border -mx-2">
            {weight.slice().reverse().slice(0, 5).map(w => (
              <div key={w.day} className="flex items-center justify-between px-2 py-1.5 text-sm">
                <span className="text-muted-foreground text-xs">{w.day.slice(5)}</span>
                <span className="tabular-nums">{w.kg} kg</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Coming soon">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>· Body composition</div>
            <div>· Blood pressure</div>
            <div>· Blood glucose</div>
            <div>· Steps / heart rate</div>
            <div className="pt-2 opacity-70">Ask in chat and I'll wire the schema.</div>
          </div>
        </Card>
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
