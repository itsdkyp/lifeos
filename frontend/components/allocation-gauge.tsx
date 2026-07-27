"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useProfile, currencySymbol } from "@/lib/profile";

type Row = {
  key: string; label: string; value: number; pct: number;
  target_lo: number; target_hi: number; gap_amount: number;
  status: "ok" | "low" | "high" | "empty";
};
type Data = { total_value: number; currency: string; age: number | null; rows: Row[] };

const STATUS_TINT: Record<Row["status"], string> = {
  ok:    "bg-emerald-500",
  low:   "bg-amber-500",
  high:  "bg-orange-500",
  empty: "bg-muted",
};

export function AllocationGauge() {
  const [data, setData] = useState<Data | null>(null);
  const { profile } = useProfile();

  useEffect(() => {
    const load = () => fetch((process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787") + "/holdings/allocation")
      .then(r => r.json()).then(setData).catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;
  const sym = currencySymbol(data.currency ?? profile?.currency);
  // Max axis: whichever is bigger — current pct or target_hi — for consistent bar width.
  const axisMax = Math.max(50, ...data.rows.map(r => Math.max(r.pct, r.target_hi))) + 5;

  return (
    <div className="rounded-2xl border border-border bg-card/40 p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Allocation vs target</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {data.age != null ? `Target scales with age ${data.age}. ` : "Set your DOB in Settings for age-based targets. "}
            Total {sym}{data.total_value.toLocaleString()}.
          </div>
        </div>
        <Legend />
      </div>

      <div className="space-y-2.5">
        {data.rows.map(r => (
          <GaugeRow key={r.key} row={r} axisMax={axisMax} sym={sym} />
        ))}
      </div>
    </div>
  );
}

function GaugeRow({ row, axisMax, sym }: { row: Row; axisMax: number; sym: string }) {
  const currentW = Math.max(0.5, Math.min(100, (row.pct / axisMax) * 100));
  const tLoW = (row.target_lo / axisMax) * 100;
  const tHiW = (row.target_hi / axisMax) * 100;
  const gapPositive = row.gap_amount >= 0;

  return (
    <div className="space-y-1 sm:space-y-0 sm:grid sm:grid-cols-[9rem_1fr_5rem] sm:items-center sm:gap-3">
      {/* Row 1 on mobile: label + right-aligned value; on desktop: left column only */}
      <div className="flex items-baseline justify-between sm:block text-xs">
        <div className="font-medium truncate">{row.label}</div>
        <div className="sm:hidden text-[11px] tabular-nums">
          <span className="font-medium">{sym}{Math.abs(row.value).toLocaleString()}</span>
          {row.gap_amount !== 0 && (
            <span className={cn("ml-1.5", gapPositive ? "text-emerald-500" : "text-orange-500")}>
              {gapPositive ? "+" : ""}{sym}{Math.abs(row.gap_amount).toLocaleString()}
            </span>
          )}
        </div>
        <div className="hidden sm:block text-[10px] text-muted-foreground">target {row.target_lo}–{row.target_hi}%</div>
      </div>

      {/* The bar (spans full width on mobile) */}
      <div className="relative h-5 rounded-md bg-secondary/50 overflow-visible">
        <div className="absolute top-0 bottom-0 rounded-md border border-dashed border-primary/40 bg-primary/5"
             style={{ left: `${tLoW}%`, width: `${Math.max(0.5, tHiW - tLoW)}%` }} />
        <div className={cn("absolute top-0 bottom-0 rounded-md", STATUS_TINT[row.status])}
             style={{ width: `${currentW}%`, opacity: 0.85 }} />
        <div className="relative z-10 h-full flex items-center px-2 text-[10px] font-medium tabular-nums text-foreground">
          {row.pct.toFixed(1)}% <span className="sm:hidden ml-1.5 text-[9px] text-muted-foreground">/ {row.target_lo}–{row.target_hi}% target</span>
        </div>
      </div>

      {/* Desktop-only right column */}
      <div className="hidden sm:block text-right text-[11px] tabular-nums">
        <div className="font-medium">{sym}{Math.abs(row.value).toLocaleString()}</div>
        {row.gap_amount !== 0 && (
          <div className={gapPositive ? "text-emerald-500" : "text-orange-500"}>
            {gapPositive ? "+" : ""}{sym}{Math.abs(row.gap_amount).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-500" />in range</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-amber-500" />low</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-orange-500" />high</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded border border-dashed border-primary/40" />target</span>
    </div>
  );
}
