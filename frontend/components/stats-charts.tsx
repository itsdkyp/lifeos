"use client";
import type { Stats } from "@/lib/api";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

const COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c"];
const tick = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };
const grid = "hsl(var(--border))";
const tooltip = { background: "hsl(var(--card))", border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" };

export function StatsCharts({ stats }: { stats: Stats | null }) {
  if (!stats) return <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>;

  const data = stats.labels.map((d, i) => ({
    d: d.slice(5),
    spend: stats.spend[i],
    mood: stats.mood[i],
    hours: stats.hours[i],
    weight: stats.weight?.[i] ?? null,
    kcal: stats.kcal?.[i] ?? 0,
    sleep: stats.sleep?.[i] ?? null,
  }));
  const cats = stats.categories.labels.map((label, i) => ({ name: label, value: stats.categories.values[i] }));
  const hasWeight = data.some(x => x.weight != null);
  const hasKcal   = data.some(x => x.kcal > 0);
  const hasSleep  = data.some(x => x.sleep != null);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartBox title="Mood">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
            <YAxis domain={[1, 10]} tick={tick} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
            <Line type="monotone" dataKey="mood" stroke="#f472b6" strokeWidth={2} dot={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </ChartBox>

      {hasSleep && (
        <ChartBox title="Sleep (hours)">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 12]} tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="sleep" stroke="#a78bfa" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {hasWeight && (
        <ChartBox title="Weight (kg)">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
              <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
              <Line type="monotone" dataKey="weight" stroke="#22d3ee" strokeWidth={2} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      <ChartBox title="Work hours">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
            <Bar dataKey="hours" fill="#60a5fa" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>

      {hasKcal && (
        <ChartBox title="Calories">
          <ResponsiveContainer>
            <BarChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} strokeDasharray="3 3" />
              <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
              <Bar dataKey="kcal" fill="#fbbf24" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      <ChartBox title="Daily spend">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis dataKey="d" tick={tick} axisLine={false} tickLine={false} />
            <YAxis tick={tick} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} />
            <Bar dataKey="spend" fill="#34d399" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>

      {cats.length > 0 && (
        <ChartBox title="Spend by category">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={cats} dataKey="value" nameKey="name"
                cx="35%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2}
                label={({ percent }) => percent && percent > 0.06 ? `${Math.round(percent * 100)}%` : ""}
                labelLine={false}
                stroke="hsl(var(--card))">
                {cats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Legend layout="vertical" align="right" verticalAlign="middle"
                iconType="circle" iconSize={8}
                formatter={(v) => <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
              <Tooltip contentStyle={tooltip} itemStyle={{ color: "hsl(var(--foreground))" }} formatter={(v: number) => v.toFixed(2)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>
      )}
    </div>
  );
}

function ChartBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="h-56">{children}</div>
    </div>
  );
}
