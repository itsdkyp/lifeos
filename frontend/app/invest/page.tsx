"use client";
import { useEffect, useMemo, useState } from "react";
import { api, type HoldingsResp, type Holding } from "@/lib/api";
import { Card } from "@/components/card";
import { Plus, Trash2, RefreshCw, TrendingUp, TrendingDown, ChevronDown, CalendarPlus, Mail } from "lucide-react";
import { useProfile, currencySymbol } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { InvestmentAdvice } from "@/components/investment-advice";
import { SymbolAutocomplete } from "@/components/symbol-autocomplete";
import Masonry from "react-masonry-css";

const COLORS = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#22d3ee", "#f87171", "#fb923c"];

type Bucket = { title: string; holdings: (Holding & { _folios?: number })[]; currency: string };

function mergeByScheme(holdings: Holding[]): (Holding & { _folios?: number })[] {
  const groups = new Map<string, Holding[]>();
  for (const h of holdings) {
    const key = `${h.symbol}|${h.kind}|${h.currency}`;
    const g = groups.get(key); if (g) g.push(h); else groups.set(key, [h]);
  }
  const out: (Holding & { _folios?: number })[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]!); continue; }
    const shares = group.reduce((s, h) => s + h.shares, 0);
    const value  = group.reduce((s, h) => s + h.value,  0);
    const cost   = group.reduce((s, h) => s + h.cost,   0);
    out.push({
      ...group[0]!, shares, cost_basis: cost / shares, value, cost,
      gain: value - cost,
      gain_pct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
      _folios: group.length,
    });
  }
  return out.sort((a, b) => b.value - a.value);
}

function classifyAsset(h: Holding & { note?: string | null }): string {
  const s = (h.symbol + " " + (h.note ?? "")).toLowerCase();
  if (h.kind === "crypto")                                        return "Crypto";
  if (/\b(epf|epfo|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis|sgb)\b/i.test(s)) return "Retirement (EPF/PPF/NPS)";
  if (h.kind === "debt")                                          return "Debt / Fixed income";
  if (/\bgold(bees|ietf|shar)?\b/i.test(s))                       return "Gold";
  if (/\bsilver(bees|ietf)?\b/i.test(s))                          return "Silver";
  if (/\b(debt|bond|gilt|liquid|income|overnight|corporate|epf|epfo|ppf|nps|provident|gsec|fd|rd)\b/i.test(s)) return "Debt / Bonds";
  if (h.currency !== "INR")                                       return "US equity";
  return "Indian equity";
}

function bucketize(holdings: Holding[]): Bucket[] {
  const filt = (fn: (h: Holding) => boolean) => mergeByScheme(holdings.filter(fn));
  const isRetirement = (h: Holding) => /\b(epf|epfo|ppf|nps|vpf|ssy|kvp|nsc|scss|pomis|sgb)\b/i.test(`${h.symbol} ${(h as any).note ?? ""}`);
  return [
    { title: "Indian stocks & ETFs", holdings: filt(h => (h.kind === "stock" || h.kind === "etf") && h.currency === "INR"), currency: "INR" },
    { title: "US stocks & ETFs",     holdings: filt(h => (h.kind === "stock" || h.kind === "etf") && h.currency !== "INR"), currency: "USD" },
    { title: "Mutual funds",         holdings: filt(h => h.kind === "mf" && !isRetirement(h)), currency: "INR" },
    { title: "Retirement (EPF/PPF/NPS)", holdings: filt(h => isRetirement(h)),  currency: "INR" },
    { title: "Debt / Fixed income",  holdings: filt(h => (h.kind as any) === "debt" && !isRetirement(h)), currency: "INR" },
    { title: "Crypto",               holdings: filt(h => h.kind === "crypto"), currency: "USD" },
  ].filter(b => b.holdings.length > 0);
}

function bucketTotals(hs: Holding[]) {
  const value = hs.reduce((s, h) => s + h.value, 0);
  const cost  = hs.reduce((s, h) => s + h.cost,  0);
  const daily_gain = hs.reduce((s, h) => s + (h.daily_gain ?? 0), 0);
  return { value, cost, gain: value - cost, pct: cost > 0 ? ((value - cost) / cost) * 100 : 0, daily_gain };
}

export default function Page() {
  const [data, setData] = useState<HoldingsResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const { profile } = useProfile();
  const psym = currencySymbol(profile?.currency);

  const load = (force = false) => { setLoading(true); api.holdings(force).then(setData).catch(() => {}).finally(() => setLoading(false)); };
  
  useEffect(() => { load(); }, []);

  const isLive = data?.market_live?.in || data?.market_live?.us;
  const intervalMs = isLive ? 15_000 : 60_000;
  
  useEffect(() => {
    const id = setInterval(() => load(false), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const buckets = data ? bucketize(data.holdings) : [];

  // Allocation pie: by asset TYPE (gold, silver, Indian equity, US equity, debt, crypto)
  const allocationData = useMemo(() => {
    if (!data?.grand || data.holdings.length === 0) return [];
    const nativeByCcy = new Map<string, number>();
    for (const h of data.holdings) nativeByCcy.set(h.currency, (nativeByCcy.get(h.currency) ?? 0) + h.value);
    const inrPart = nativeByCcy.get("INR") ?? 0;
    const usdPart = nativeByCcy.get("USD") ?? 0;
    const usdRate = usdPart ? (data.grand.value - inrPart) / usdPart : 1;
    const rateFor = (ccy: string) => ccy === "INR" ? 1 : (ccy === "USD" ? usdRate : 1);

    const bucketByType = new Map<string, number>();
    for (const h of data.holdings) {
      const type = classifyAsset(h);
      bucketByType.set(type, (bucketByType.get(type) ?? 0) + h.value * rateFor(h.currency));
    }
    return [...bucketByType.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] space-y-4">
      <Header data={data} loading={loading} onRefresh={load} psym={psym} />

      {/* Top row: grand summary strip */}
      {data?.grand && <GrandStrip data={data} psym={psym} />}

      {/* Charts row — fixed heights, own row so they don't create gaps in the bucket masonry */}
      {(allocationData.length > 0 || buckets.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {allocationData.length > 0 && <AllocationCard data={allocationData} psym={psym} />}
          <BucketBarsCard buckets={buckets} psym={psym} />
        </div>
      )}

      {/* Buckets: JS masonry — each card placed in the shortest column, zero vertical gaps. */}
      <Masonry
        breakpointCols={{ default: 2, 640: 1 }}
        className="flex -ml-4 w-auto"
        columnClassName="pl-4 bg-clip-padding">
        {[...buckets]
          .sort((a, b) => b.holdings.length - a.holdings.length)
          .map(b => (
            <div key={b.title} className="mb-4">
              <BucketCard bucket={b} 
                onDelete={async id => { await api.holdingDelete(id); load(); }} 
                onEditSip={async (id, current) => {
                  const v = window.prompt("Monthly contribution (leave blank to clear):", current?.toString() ?? "");
                  if (v === null) return;
                  const num = parseFloat(v);
                  await api.holdingPatch(id, { monthly_contribution: isNaN(num) ? null : num } as any);
                  load();
                }}
              />
            </div>
          ))}
      </Masonry>

      {/* Financial advisor at the bottom, full-width interactive */}
      <InvestmentAdvice />

      {/* Add position — collapsible */}
      <Card>
        <button onClick={() => setAddOpen(v => !v)} className="w-full flex items-center justify-between text-sm">
          <span className="font-medium">Add position manually</span>
          <ChevronDown className={cn("h-4 w-4 transition", addOpen && "rotate-180")} />
        </button>
        {addOpen && <div className="mt-4"><AddForm onDone={load} /></div>}
      </Card>

      {(!data || data.holdings.length === 0) && (
        <Card><div className="text-sm text-muted-foreground text-center py-8">No positions yet. Import a Groww / Ind Money file above.</div></Card>
      )}
    </div>
  );
}

function Header({ data, loading, onRefresh, psym }: { data: HoldingsResp | null; loading: boolean; onRefresh: (force: boolean) => void; psym: string }) {
  const liveIn = data?.market_live?.in;
  const liveUs = data?.market_live?.us;
  const [syncingGmail, setSyncingGmail] = useState(false);

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
          {(liveIn || liveUs) && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] uppercase font-bold tracking-wider">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {liveIn && liveUs ? "Markets live" : liveIn ? "IN Market live" : "US Market live"}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">Prices via Yahoo (stocks/ETFs/crypto) + AMFI (Indian MFs) · FX live · totals in {psym}.</p>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => onRefresh(true)} disabled={loading}
          className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs flex items-center gap-1">
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
        </button>
        <button onClick={async () => {
          try { const r = await api.holdingsResolve(); alert(`Resolved ${r.resolved}/${r.tried} tickers.`); onRefresh(true); }
          catch (e: any) { alert(String(e.message ?? e)); }
        }} className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs">
          Auto-resolve tickers
        </button>
        <button onClick={async () => {
          setSyncingGmail(true);
          try { 
            const r = await api.holdingsSyncGmail(); 
            alert(`Synced from Gmail: ${r.imported} trades added.`); 
            onRefresh(true); 
          } catch (e: any) { alert(String(e.message ?? e)); }
          finally { setSyncingGmail(false); }
        }} disabled={syncingGmail} className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs flex items-center gap-1">
          <Mail className={cn("h-3.5 w-3.5", syncingGmail && "animate-pulse")} /> Sync Gmail
        </button>
        <label className="rounded-md bg-primary text-primary-foreground hover:opacity-90 px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Import Groww / Ind Money
          <input type="file" accept=".xlsx,.xls" className="hidden" onChange={async e => {
            const f = e.target.files?.[0]; if (!f) return;
            try {
              const r = await api.holdingsImport(f);
              const bits = [`Imported ${r.imported} from ${r.source}`];
              if (r.skipped)      bits.push(`skipped ${r.skipped}`);
              if (r.consolidated) bits.push(`consolidated ${r.consolidated} manual duplicate${r.consolidated > 1 ? "s" : ""}`);
              alert(bits.join(" · ") + ".");
              onRefresh(true);
            } catch (err: any) { alert(String(err.message ?? err)); }
            e.target.value = "";
          }} />
        </label>
      </div>
    </header>
  );
}

function GrandStrip({ data, psym }: { data: HoldingsResp; psym: string }) {
  const g = data.grand!;
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 backdrop-blur px-5 py-4 grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total value</div>
        <div className="text-xl sm:text-2xl font-semibold tabular-nums">{psym}{Math.round(g.value).toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Today's P&amp;L</div>
        <div className={cn("text-xl sm:text-2xl font-semibold tabular-nums",
          (g.daily_gain ?? 0) >= 0 ? "text-emerald-500" : "text-destructive")}>
          {(g.daily_gain ?? 0) >= 0 ? "+" : ""}{psym}{Math.round(g.daily_gain ?? 0).toLocaleString()}
        </div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Cost basis</div>
        <div className="text-xl sm:text-2xl font-semibold tabular-nums text-muted-foreground">{psym}{Math.round(g.cost).toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total P&amp;L</div>
        <div className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-0 tabular-nums",
          g.gain >= 0 ? "text-emerald-500" : "text-destructive")}>
          <span className="text-xl sm:text-2xl font-semibold">
            {g.gain >= 0 ? "+" : ""}{psym}{Math.round(g.gain).toLocaleString()}
          </span>
          <span className="text-xs sm:text-sm">({g.pct.toFixed(1)}%)</span>
        </div>
      </div>
    </div>
  );
}

function AllocationCard({ data, psym }: { data: { name: string; value: number }[]; psym: string }) {
  return (
    <Card title="Allocation">
      <div className="h-56">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={40} outerRadius={80} paddingAngle={2}
              label={({ percent }) => percent && percent > 0.06 ? `${Math.round(percent * 100)}%` : ""} labelLine={false}
              stroke="hsl(var(--card))">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
              formatter={(v) => <span className="text-[11px]" style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v: number) => `${psym}${Math.round(v).toLocaleString()}`} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function BucketBarsCard({ buckets, psym }: { buckets: Bucket[]; psym: string }) {
  const data = buckets.map(b => {
    const t = bucketTotals(b.holdings);
    return { name: b.title, gain: Math.round(t.gain), pct: +(t.pct.toFixed(1)) };
  });
  return (
    <Card title="P&L by bucket (native currency)">
      <div className="h-40">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={110} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--foreground))" }}
              formatter={(v: number, k) => k === "pct" ? `${v}%` : `${v.toLocaleString()}`} />
            <Bar dataKey="gain" radius={[0, 4, 4, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.gain >= 0 ? "#34d399" : "#f87171"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function BucketCard({ bucket, onDelete, onEditSip }: { bucket: Bucket; onDelete: (id: number) => void; onEditSip?: (id: number, current?: number) => void }) {
  const sym = currencySymbol(bucket.currency);
  const t = bucketTotals(bucket.holdings);
  return (
    <Card>
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{bucket.title}</div>
          <div className="text-lg font-semibold tabular-nums">{sym}{Math.round(t.value).toLocaleString()}</div>
        </div>
        <div className="text-right">
          <div className={cn("text-xs tabular-nums font-medium", t.daily_gain >= 0 ? "text-emerald-500" : "text-destructive")}>
            {t.daily_gain >= 0 ? "+" : ""}{sym}{Math.round(t.daily_gain).toLocaleString()} today
          </div>
          <div className={cn("text-[10px] tabular-nums", t.gain >= 0 ? "text-emerald-500/80" : "text-destructive/80")}>
            {t.gain >= 0 ? "+" : ""}{sym}{Math.round(t.gain).toLocaleString()} ({t.pct.toFixed(1)}%) total
          </div>
        </div>
      </div>
      <div className="divide-y divide-border -mx-2 max-h-[22rem] overflow-y-auto">
        {bucket.holdings.map(h => (
          <div key={h.id} className="group flex items-center justify-between gap-3 px-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate flex items-center gap-1.5">
                <span className="truncate">{h.symbol}</span>
                {(h as any)._folios && <span className="text-[9px] uppercase text-muted-foreground/70 shrink-0">×{(h as any)._folios}</span>}
                {(h as any).price_source === "report" && <span className="text-[9px] uppercase text-amber-500/80 shrink-0">rpt</span>}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">{h.shares.toLocaleString(undefined, { maximumFractionDigits: 3 })} × {sym}{h.cost_basis.toFixed(2)}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="tabular-nums">{sym}{Math.round(h.value).toLocaleString()}</div>
              <div className="flex items-center justify-end gap-1.5">
                {h.daily_gain_pct != null && h.daily_gain_pct !== 0 && (
                  <div className={cn("text-[10px] tabular-nums font-medium", h.daily_gain_pct >= 0 ? "text-emerald-500" : "text-destructive")}>
                    {h.daily_gain_pct >= 0 ? "↑" : "↓"} {Math.abs(h.daily_gain_pct).toFixed(1)}%
                  </div>
                )}
                <div className={cn("text-[10px] tabular-nums", h.gain >= 0 ? "text-emerald-500/80" : "text-destructive/80")}>
                  ({h.gain >= 0 ? "+" : ""}{h.gain_pct.toFixed(1)}% total)
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onEditSip && (h.kind === "mf" || (h.kind as any) === "debt") && (
                <button onClick={() => onEditSip(h.id, h.monthly_contribution)}
                  className={cn("opacity-30 hover:opacity-100 shrink-0", h.monthly_contribution ? "text-primary opacity-80" : "text-muted-foreground")}
                  title={`Monthly contribution: ${h.monthly_contribution ? sym + h.monthly_contribution : "None"}`}>
                  <CalendarPlus className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => onDelete(h.id)}
                className="opacity-30 hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [symbol, setSymbol] = useState("");
  const [kind, setKind] = useState<"stock"|"etf"|"crypto"|"mf"|"debt">("stock");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [monthly, setMonthly] = useState("");
  const { profile } = useProfile();
  useEffect(() => { setCurrency(profile?.currency ?? "USD"); }, [profile]);

  async function add() {
    const sh = parseFloat(shares), cb = parseFloat(cost);
    if (!symbol.trim() || !sh || !cb) return;
    const mc = parseFloat(monthly);
    await api.holdingAdd({ symbol: symbol.toUpperCase(), kind, shares: sh, cost_basis: cb, currency,
      monthly_contribution: Number.isFinite(mc) && mc > 0 ? mc : undefined });
    setSymbol(""); setShares(""); setCost(""); setMonthly("");
    onDone();
  }
  const showMonthly = kind === "debt" || kind === "mf";
  return (
    <div className="space-y-3">
      <div className="grid gap-2 md:grid-cols-6">
        <div className="md:col-span-2">
          <SymbolAutocomplete value={symbol}
            onChange={v => setSymbol(v.toUpperCase())}
            onPick={p => { setSymbol(p.symbol); setKind(p.kind); setCurrency(p.currency); }} />
        </div>
        <select value={kind} onChange={e => setKind(e.target.value as any)} className={inputCls}>
          <option value="stock">stock</option><option value="etf">ETF</option>
          <option value="mf">mutual fund</option>
          <option value="debt">debt / fixed income</option>
          <option value="crypto">crypto</option>
        </select>
        <input value={shares} onChange={e => setShares(e.target.value)} placeholder={kind === "debt" ? "units (use 1 for balance-style)" : "shares"} type="number" step="any" className={inputCls} />
        <input value={cost}   onChange={e => setCost(e.target.value)}   placeholder={kind === "debt" ? "current balance / unit" : "cost / unit"} type="number" step="any" className={inputCls} />
        <button onClick={add} className="rounded-md bg-primary text-primary-foreground px-4 hover:opacity-90 flex items-center justify-center gap-1 text-sm">
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>
      {showMonthly && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Monthly contribution (auto-added on each month):</label>
          <input value={monthly} onChange={e => setMonthly(e.target.value)}
            type="number" step="any" placeholder="e.g. 6000 for EPF" className={cn(inputCls, "max-w-[180px]")} />
          <span className="text-[11px] text-muted-foreground">Leave blank for none.</span>
        </div>
      )}
    </div>
  );
}

const inputCls = "rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
