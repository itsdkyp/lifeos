"use client";
import { useEffect, useState } from "react";
import { api, type Txn } from "@/lib/api";
import { Card } from "@/components/card";
import { QuickTxn } from "@/components/quick-txn";
import { BudgetPacing } from "@/components/budget-pacing";
import { useProfile, currencySymbol, fmtLocal } from "@/lib/profile";
import { Upload, Database, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Page() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [budget, setBudget] = useState<any>(null);
  const { profile } = useProfile();
  const sym = currencySymbol(profile?.currency);
  const [importMsg, setImportMsg] = useState("");

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const text = await f.text();
    const res = await api.financeImport(text);
    setImportMsg(`Imported ${res.imported}${res.failed ? ` · skipped ${res.failed}` : ""}`);
    setTimeout(() => setImportMsg(""), 4000);
    e.target.value = "";
    refresh();
  }
  const refresh = () => {
    api.finance(60).then(setTxns).catch(() => {});
    api.financeBudget().then(setBudget).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);
  return (
    <div className="mx-auto max-w-5xl 2xl:max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Money</h1>
        <div className="flex gap-2 items-center">
          <label className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs cursor-pointer flex items-center gap-1">
            <Upload className="h-3.5 w-3.5" /> Import CSV
            <input type="file" accept=".csv,text/csv" onChange={onCsv} className="hidden" />
          </label>
          {importMsg && <span className="text-xs text-emerald-500">{importMsg}</span>}
        </div>
      </header>
      <div className="text-xs text-muted-foreground">
        CSV format: <code className="text-foreground">date,amount,category,note[,kind]</code>. Amount positive = expense, negative or kind=income = income.
      </div>
      
      <BudgetPacing data={budget} />

      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="min-w-0">
          <Card title="Add transaction"><QuickTxn onDone={refresh} /></Card>
        </div>
        <div className="min-w-0">
          <Card title="Last 60 days">
            <div className="divide-y divide-border max-h-[500px] overflow-y-auto -mx-2">
              {txns.map(t => (
                <div key={t.id} className="group flex items-center justify-between px-2 py-2 text-sm gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{t.category}{t.note ? ` · ${t.note}` : ""}</div>
                    <div className="text-xs text-muted-foreground">{fmtLocal(t.ts)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className={cn("tabular-nums font-medium shrink-0", 
                      t.kind === "income" ? "text-emerald-500" : 
                      t.kind === "transfer" ? "text-muted-foreground" : "")}>
                      {t.kind === "income" ? "+" : t.kind === "transfer" ? "" : "-"}{sym}{t.amount.toFixed(2)}
                    </div>
                    <button onClick={async () => { await api.txnDelete(t.id); refresh(); }}
                      className="opacity-50 hover:opacity-100 md:opacity-30 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0 p-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {txns.length === 0 && <div className="text-sm text-muted-foreground p-6 text-center">Nothing yet.</div>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
