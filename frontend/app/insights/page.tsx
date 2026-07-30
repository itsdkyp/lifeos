"use client";
import { useEffect, useState, useMemo } from "react";
import { api, type Stats } from "@/lib/api";
import { useProfile } from "@/lib/profile";
import { Card } from "@/components/card";
import { RefreshCw, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";

type MetricId = "mood" | "spend" | "sleep" | "water" | "kcal" | "hours" | "weight";

const METRICS: Record<MetricId, { label: string; color: string }> = {
  mood:   { label: "Mood", color: "#f472b6" },
  sleep:  { label: "Sleep (h)", color: "#a78bfa" },
  water:  { label: "Water (ml)", color: "#60a5fa" },
  spend:  { label: "Spend", color: "#34d399" },
  hours:  { label: "Deep Work (h)", color: "#fb923c" },
  kcal:   { label: "Calories", color: "#fbbf24" },
  weight: { label: "Weight (kg)", color: "#22d3ee" },
};

export default function InsightsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricId>>(new Set(["mood", "sleep", "water"]));
  const { profile } = useProfile();

  const load = () => {
    setLoading(true);
    api.stats(days).then(setStats).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [days]);

  const toggleMetric = (id: MetricId) => {
    const next = new Set(activeMetrics);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setActiveMetrics(next);
  };

  // Normalize data so everything overlays cleanly on a 0-100 scale.
  const chartData = useMemo(() => {
    if (!stats) return [];
    
    // Fixed benchmarks / ideal baselines so the scale isn't wildly distorted by outliers
    const bounds: Record<MetricId, { min: number; max: number }> = {
      mood:   { min: 1, max: 10 },               // 10 is ideal
      sleep:  { min: 0, max: profile?.sleep_target_hours || 8 },  // 100% = target sleep
      water:  { min: 0, max: 3000 },             // 3000ml is 100% baseline
      hours:  { min: 0, max: 6 },                // 6h deep work is 100% baseline
      kcal:   { min: 0, max: 2500 },             // 2500 kcal is 100% baseline
      spend:  { min: 0, max: 1000 },             // Will calculate dynamic max
      weight: { min: 0, max: 100 },              // Will calculate dynamic tight bounds
    };

    // For spend, we want higher spend to look higher, but baseline is 0. 
    // We set max to whatever the highest spend was in this period so it fits the chart.
    const spendValid = (stats.spend || []).filter(v => v != null) as number[];
    if (spendValid.length > 0) {
      bounds.spend.max = Math.max(...spendValid, 100); 
    }

    // Weight needs tight bounds to show correlation, as daily change is usually < 1kg
    const wValid = (stats.weight || []).filter(v => v != null && v !== 0) as number[];
    if (wValid.length > 0) {
      const wMin = Math.min(...wValid);
      const wMax = Math.max(...wValid);
      // Pad by 2kg on either side so the line isn't touching the literal top/bottom
      bounds.weight = { min: wMin - 2, max: wMax + 2 };
    }

    return stats.labels.map((date, i) => {
      const point: any = { d: date.slice(5), fullDate: date };
      
      const setPoint = (id: MetricId, rawVal: number | null | undefined) => {
        if (rawVal != null && rawVal !== 0) {
          point[`${id}_raw`] = rawVal;
          let pct = ((rawVal - bounds[id].min) / (bounds[id].max - bounds[id].min)) * 100;
          // cap between 0 and 100 so massive outliers don't crush the rest of the chart
          if (pct > 100) pct = 100;
          if (pct < 0) pct = 0;
          point[id] = pct;
        } else {
          point[id] = null;
        }
      };

      setPoint("mood", stats.mood[i]);
      setPoint("spend", stats.spend[i]);
      setPoint("sleep", stats.sleep?.[i]);
      setPoint("water", stats.water?.[i]);
      setPoint("kcal", stats.kcal?.[i]);
      setPoint("hours", stats.hours[i]);
      setPoint("weight", stats.weight?.[i]);

      return point;
    });
  }, [stats, profile]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border/50 shadow-xl rounded-xl p-3 text-sm">
          <p className="font-semibold mb-2 pb-2 border-b border-border/50">{payload[0].payload.fullDate}</p>
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5" style={{ color: p.color }}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {METRICS[p.dataKey as MetricId].label}
              </span>
              <span className="font-mono font-medium">{p.payload[`${p.dataKey}_raw`]}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
             <Activity className="h-6 w-6 text-primary" /> Multi-Metric Overlay
          </h1>
          <p className="text-sm text-muted-foreground">Select multiple metrics below to see how they correlate visually over time.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={days} onChange={e => setDays(Number(e.target.value))}
            className="rounded-md bg-secondary/50 border border-border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={load} disabled={loading} className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-sm flex items-center gap-2 transition-colors">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> Refresh
          </button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(METRICS) as MetricId[]).map(id => {
          const isActive = activeMetrics.has(id);
          const meta = METRICS[id];
          return (
            <button 
              key={id} 
              onClick={() => toggleMetric(id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                isActive ? "bg-secondary text-foreground shadow-sm" : "bg-transparent text-muted-foreground opacity-60 border-transparent hover:bg-secondary/30"
              )}
              style={isActive ? { borderColor: meta.color } : {}}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}
      </div>

      <Card className="p-2 sm:p-6">
        {loading && !stats ? (
          <div className="py-20 text-center text-sm text-muted-foreground flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            Crunching your data...
          </div>
        ) : chartData.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">No data available for this period.</div>
        ) : (
          <div className="h-[500px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} opacity={0.5} />
                <XAxis 
                  dataKey="d" 
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} 
                  axisLine={false} 
                  tickLine={false} 
                  dy={10}
                />
                <YAxis hide domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} />
                
                {Array.from(activeMetrics).map(id => (
                  <Line 
                    key={id}
                    type="basis" 
                    dataKey={id} 
                    stroke={METRICS[id].color} 
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: METRICS[id].color, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      
      <p className="text-xs text-muted-foreground text-center">
        * Graphs are mathematically normalized relative to ideal baselines (e.g. 100% = {profile?.sleep_target_hours || 8}h sleep, 3000ml water, 6h deep work). Tooltips display your real raw data.
      </p>
    </div>
  );
}
