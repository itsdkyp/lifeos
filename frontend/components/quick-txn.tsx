"use client";
import { useEffect, useState } from "react";
import { api, type Account } from "@/lib/api";
import { cn } from "@/lib/utils";

export function QuickTxn({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);

  useEffect(() => {
    api.accounts().then(res => {
      setAccounts(res.accounts);
      if (res.accounts.length > 0) {
        setAccountId(res.accounts[0].id);
        if (res.accounts.length > 1) setToAccountId(res.accounts[1].id);
      }
    }).catch(() => {});
  }, []);

  async function submit() {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    if (kind === "transfer" && (!accountId || !toAccountId || accountId === toAccountId)) return alert("Please select two different accounts for transfer");
    
    setSaving(true);
    try { 
      await api.addTxn({ 
        amount: a, 
        category: kind === "transfer" ? "transfer" : category, 
        note, 
        kind, 
        account_id: accountId,
        to_account_id: kind === "transfer" ? toAccountId : null
      }); 
      setAmount(""); setNote(""); onDone(); 
    }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setKind("expense")}
          className={`flex-1 rounded-md px-2 py-1 text-xs ${kind === "expense" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>Expense</button>
        <button onClick={() => setKind("income")}
          className={`flex-1 rounded-md px-2 py-1 text-xs ${kind === "income" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>Income</button>
        <button onClick={() => setKind("transfer")}
          className={`flex-1 rounded-md px-2 py-1 text-xs ${kind === "transfer" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>Transfer</button>
      </div>
      <input type="number" step="0.01" inputMode="decimal" value={amount}
        onChange={e => setAmount(e.target.value)} placeholder="0.00"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-2xl font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring" />
      {kind !== "transfer" && (
        <div className="grid grid-cols-2 gap-2">
          <input value={category} onChange={e => setCategory(e.target.value)} placeholder="category"
            className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="note"
            className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      )}
      {kind === "transfer" && (
        <div className="grid grid-cols-1 gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="note (optional)"
            className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      )}
      
      <div className={cn("grid gap-2", kind === "transfer" ? "grid-cols-2" : "grid-cols-1")}>
        <div className="space-y-1">
          {kind === "transfer" && <div className="text-[10px] text-muted-foreground uppercase px-1">From</div>}
          <select value={accountId ?? ""} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
            <option value="">No Account</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
            ))}
          </select>
        </div>
        
        {kind === "transfer" && (
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground uppercase px-1">To</div>
            <select value={toAccountId ?? ""} onChange={e => setToAccountId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
              <option value="">Select Account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button disabled={saving} onClick={submit}
        className="w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 hover:opacity-90 disabled:opacity-50">
        {kind === "transfer" ? "Transfer" : "Add"}
      </button>
    </div>
  );
}
