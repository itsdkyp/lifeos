"use client";
import { useState } from "react";
import { api } from "@/lib/api";

export function QuickTxn({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    setSaving(true);
    try { await api.addTxn({ amount: a, category, note, kind }); setAmount(""); setNote(""); onDone(); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setKind("expense")}
          className={`flex-1 rounded-md px-2 py-1 text-xs ${kind === "expense" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>Expense</button>
        <button onClick={() => setKind("income")}
          className={`flex-1 rounded-md px-2 py-1 text-xs ${kind === "income" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>Income</button>
      </div>
      <input type="number" step="0.01" inputMode="decimal" value={amount}
        onChange={e => setAmount(e.target.value)} placeholder="0.00"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-2xl font-semibold tabular-nums outline-none focus:ring-2 focus:ring-ring" />
      <div className="grid grid-cols-2 gap-2">
        <input value={category} onChange={e => setCategory(e.target.value)} placeholder="category"
          className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="note"
          className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <button disabled={saving} onClick={submit}
        className="w-full rounded-md bg-primary text-primary-foreground text-sm font-medium py-2 hover:opacity-90 disabled:opacity-50">
        Add
      </button>
    </div>
  );
}
