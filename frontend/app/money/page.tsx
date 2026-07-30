"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Stats, type Summary, type Txn, type HoldingsResp } from "@/lib/api";
import { useProfile, currencySymbol } from "@/lib/profile";
import { StatCard } from "@/components/stat-card";
import { Card } from "@/components/card";
import { QuickTxn } from "@/components/quick-txn";
import { BudgetPacing } from "@/components/budget-pacing";
import { Wallet, TrendingUp, TrendingDown, Upload, ArrowRight, Landmark, Plus, Trash2, Edit2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { fmtLocal } from "@/lib/profile";

import { cn } from "@/lib/utils";

const COLORS = ["#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#a78bfa", "#f87171", "#22d3ee", "#fb923c"];

export default function Page() {
  const [s, setS] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [holdings, setHoldings] = useState<HoldingsResp | null>(null);
  const [range, setRange] = useState(30);
  const [accounts, setAccounts] = useState<any>(null);
  const [budget, setBudget] = useState<any>(null);
  const { profile } = useProfile();
  const sym = currencySymbol(profile?.currency);

  const loadAccounts = () => api.accounts().then(setAccounts).catch(() => {});

  const refreshAll = () => {
    api.summary(range).then(setS).catch(() => {});
    api.stats(range).then(setStats).catch(() => {});
    api.finance(60).then(t => setTxns(t.slice(0, 8))).catch(() => {});
    api.holdings().then(setHoldings).catch(() => {});
    api.financeBudget().then(setBudget).catch(() => {});
    loadAccounts();
  };

  useEffect(() => {
    refreshAll();
  }, [range]);

  const monthSpend = (stats?.spend ?? []).reduce((a, b) => a + b, 0);
  const cats = stats?.categories ?? { labels: [], values: [] };
  const catData = cats.labels.map((l, i) => ({ name: l, value: cats.values[i] }));
  
  const totalNetWorth = (holdings?.grand?.value ?? 0) + (accounts?.grand?.value ?? 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" /> Money
          </h1>
          <p className="text-sm text-muted-foreground">Cashflow, holdings, and where it all goes.</p>
        </div>
        <RangeToggle range={range} setRange={setRange} />
      </header>

      <BudgetPacing data={budget} />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Landmark} label="Net Worth"
          value={`${sym}${totalNetWorth.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub="Holdings + Accounts"
          tone="good" />
        <StatCard icon={Wallet} label="Spent today"
          value={s ? `${sym}${s.spend.today.toFixed(0)}` : "—"}
          sub={s ? `${range}d total ${sym}${monthSpend.toFixed(0)}` : ""} />
        <StatCard label={`Cashflow (${range}d)`}
          value={s ? `${sym}${(-monthSpend).toFixed(0)}` : "—"}
          sub="expenses only shown"
          tone={monthSpend > 0 ? "warn" : "default"} />
        <StatCard icon={TrendingUp} label="Portfolio"
          value={holdings?.grand ? `${sym}${holdings.grand.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : (holdings ? "—" : "—")}
          sub={holdings ? `${holdings.holdings.length} positions${!holdings.grand ? " · FX unavailable" : ""}` : "add a holding"} />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Daily spend · ${range}d`}>
          <div className="h-56">
            {stats && (
              <ResponsiveContainer>
                <BarChart data={stats.labels.map((d, i) => ({ d: d.slice(5), spend: stats.spend[i] }))}
                  margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="d" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="spend" fill="#34d399" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Where the money went">
          <div className="h-56">
            {catData.length > 0 && (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" cx="35%" cy="50%" innerRadius={40} outerRadius={80} paddingAngle={2}
                    label={({ percent }) => percent && percent > 0.06 ? `${Math.round(percent * 100)}%` : ""} labelLine={false}
                    stroke="hsl(var(--card))">
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" iconSize={8}
                    formatter={(v) => <span className="text-xs" style={{ color: "hsl(var(--muted-foreground))" }}>{v}</span>} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(v: number) => `${sym}${v.toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Sub-page shortcuts + recent */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0">
          <Card title="Bank accounts">
            <div className="divide-y divide-border -mx-2 max-h-56 overflow-y-auto">
              {(accounts?.accounts || [])
                .filter((a: any) => !["receivable", "payable"].includes(a.type) || Math.abs(a.balance) > 0.009)
                .map((a: any) => {
                const rowSym = currencySymbol(a.currency);
                return (
                  <div key={a.id} className="flex items-center justify-between px-2 py-2 text-sm">
                    <div>
                      <div className="font-medium">{a.name} <span className="text-[10px] uppercase text-muted-foreground border border-border rounded px-1">{a.type.replace("_", " ")}</span></div>
                    </div>
                    <div className={`tabular-nums font-medium ${a.balance < 0 ? "text-destructive" : ""}`}>
                      {a.balance < 0 ? "-" : ""}{rowSym}{Math.abs(a.balance).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                );
              })}
              {(!accounts?.accounts || accounts.accounts.length === 0) && (
                <div className="text-xs text-muted-foreground py-4 text-center">No accounts added.</div>
              )}
            </div>
            <SubLink href="/accounts" label="Manage accounts" />
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Recent transactions">
            <div className="divide-y divide-border -mx-2">
              {txns.slice(0, 6).map(t => (
                <div key={t.id} className="flex items-center justify-between px-2 py-2 text-sm gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                    <div className="text-[11px] text-muted-foreground">{fmtLocal(t.ts)}</div>
                  </div>
                  <div className={cn("tabular-nums font-medium shrink-0", 
                    t.kind === "income" ? "text-emerald-500" : 
                    t.kind === "transfer" ? "text-muted-foreground" : "")}>
                    {t.kind === "income" ? "+" : t.kind === "transfer" ? "" : "-"}{sym}{t.amount.toFixed(2)}
                  </div>
                </div>
              ))}
              {txns.length === 0 && <div className="text-xs text-muted-foreground py-4 text-center">No transactions yet.</div>}
            </div>
            <SubLink href="/finance" label="Manage expenses" />
          </Card>
        </div>

        <div className="min-w-0">
          <Card title="Top holdings">
            <div className="divide-y divide-border -mx-2">
              {(holdings?.holdings ?? []).slice(0, 5).map(h => {
                const rowSym = currencySymbol(h.currency);
                return (
                <div key={h.id} className="flex items-center justify-between px-2 py-2 text-sm gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{h.symbol} <span className="text-[10px] uppercase text-muted-foreground border border-border rounded px-1">{h.kind}</span></div>
                    <div className="text-[11px] text-muted-foreground">{h.shares} × {rowSym}{h.cost_basis.toFixed(2)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="tabular-nums">{rowSym}{h.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                    <div className={`text-[11px] tabular-nums ${h.gain >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {h.gain >= 0 ? "+" : ""}{h.gain_pct.toFixed(1)}%
                    </div>
                  </div>
                </div>
              );})}
              {(!holdings || holdings.holdings.length === 0) && (
                <div className="text-xs text-muted-foreground py-4 text-center">No positions yet.</div>
              )}
            </div>
            <SubLink href="/invest" label="Manage investments" />
          </Card>
        </div>
      </div>

      <Card title="Quick expense">
        <QuickTxn onDone={refreshAll} />
      </Card>
    </div>
  );
}

function SubLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
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
