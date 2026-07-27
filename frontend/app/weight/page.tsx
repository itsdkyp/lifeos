"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { Plus, Trash2 } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [rows, setRows] = useState<{ day: string; kg: number; note: string | null }[]>([]);
  const [kg, setKg] = useState("");
  const [note, setNote] = useState("");
  const [range, setRange] = useState(90);

  const load = () => api.weightList(range).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [range]);

  async function add() {
    const n = parseFloat(kg); if (!n || n <= 0) return;
    await api.weightAdd(n, undefined, note || undefined);
    setKg(""); setNote(""); load();
  }

  const first = rows[0]?.kg;
  const last = rows[rows.length - 1]?.kg;
  const delta = first != null && last != null ? Math.round((last - first) * 10) / 10 : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weight</h1>
          <p className="text-sm text-muted-foreground">Small, consistent measurements beat perfect ones.</p>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </header>

      <Card>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex flex-col gap-1 text-xs flex-1 min-w-[140px]">
            <span className="text-muted-foreground">Today's weight (kg)</span>
            <input type="number" step="0.1" value={kg} onChange={e => setKg(e.target.value)}
              placeholder="72.4" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-xs flex-1 min-w-[160px]">
            <span className="text-muted-foreground">Note (optional)</span>
            <input value={note} onChange={e => setNote(e.target.value)}
              placeholder="morning · after workout" className={inputCls} />
          </label>
          <button onClick={add}
            className="rounded-md bg-primary text-primary-foreground h-10 px-4 hover:opacity-90 flex items-center gap-1 text-sm">
            <Plus className="h-4 w-4" /> Log
          </button>
        </div>
      </Card>

      <Card title={rows.length ? `${rows.length} readings · ${delta != null ? (delta > 0 ? "+" : "") + delta + " kg total" : ""}` : ""}>
        <div className="h-64">
          {rows.length ? (
            <ResponsiveContainer>
              <LineChart data={rows.map(r => ({ d: r.day.slice(5), kg: r.kg }))} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
                <XAxis dataKey="d" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis domain={["dataMin - 1", "dataMax + 1"]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="kg" stroke="#60a5fa" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : <div className="text-sm text-muted-foreground text-center pt-16">No data yet.</div>}
        </div>

        <div className="mt-4 divide-y divide-border max-h-72 overflow-y-auto -mx-2">
          {rows.slice().reverse().map(r => (
            <div key={r.day} className="group flex items-center justify-between px-2 py-2 text-sm">
              <div>
                <div className="font-medium tabular-nums">{r.kg} kg</div>
                <div className="text-xs text-muted-foreground">{r.day}{r.note ? ` · ${r.note}` : ""}</div>
              </div>
              <button onClick={async () => { await api.weightDelete(r.day); load(); }}
                className="opacity-50 hover:opacity-100 md:opacity-30 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const inputCls = "rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function RangePicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-card/40 p-0.5 text-xs">
      {[[30,"30d"],[90,"90d"],[365,"1y"]].map(([n,l]) => (
        <button key={n as number} onClick={() => onChange(n as number)}
          className={`px-3 py-1.5 rounded-md ${value === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}
