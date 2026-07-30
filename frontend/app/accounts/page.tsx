"use client";
import { useEffect, useState } from "react";
import { api, type Account } from "@/lib/api";
import { Card } from "@/components/card";
import { Landmark, Plus, Trash2, Edit2, Wallet } from "lucide-react";
import { useProfile, currencySymbol, fmtLocal } from "@/lib/profile";

export default function AccountsPage() {
  const [data, setData] = useState<{ accounts: Account[]; grand?: any; fx_ok?: boolean } | null>(null);
  const { profile } = useProfile();
  const psym = currencySymbol(profile?.currency);

  const load = () => api.accounts().then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const total = data?.grand?.value ?? 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Landmark className="h-6 w-6 text-primary" /> Accounts
          </h1>
          <p className="text-sm text-muted-foreground">Manage your cash, bank accounts, and credit cards.</p>
        </div>
      </header>

      {/* KPI Strip */}
      <div className="rounded-2xl border border-primary/30 bg-primary/5 backdrop-blur px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total Cash Balance</div>
          <div className="text-xl sm:text-2xl font-semibold tabular-nums">{psym}{Math.round(total).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Active Accounts</div>
          <div className="text-xl sm:text-2xl font-semibold tabular-nums text-muted-foreground">{data?.accounts.length ?? 0}</div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Your Accounts">
            <div className="divide-y divide-border -mx-2">
              {data?.accounts.filter(a => !["receivable", "payable"].includes(a.type)).map(a => (
                <AccountRow key={a.id} a={a} allAccounts={data.accounts} onDone={load} />
              ))}
              {(!data?.accounts || data.accounts.filter(a => !["receivable", "payable"].includes(a.type)).length === 0) && (
                <div className="text-sm text-muted-foreground p-8 text-center">No standard accounts added.</div>
              )}
            </div>
          </Card>

          <Card title="Debts & IOUs">
            <div className="divide-y divide-border -mx-2">
              {data?.accounts
                .filter(a => ["receivable", "payable"].includes(a.type))
                .filter(a => Math.abs(a.balance) > 0.009)
                .map(a => (
                <AccountRow key={a.id} a={a} allAccounts={data.accounts} onDone={load} />
              ))}
              {(!data?.accounts || data.accounts.filter(a => ["receivable", "payable"].includes(a.type) && Math.abs(a.balance) > 0.009).length === 0) && (
                <div className="text-sm text-muted-foreground p-8 text-center">No active debts or IOUs. (Settled IOUs are automatically hidden).</div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Add Account">
            <AccountForm allAccounts={data?.accounts || []} onDone={load} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function AccountRow({ a, allAccounts, onDone }: { a: any; allAccounts: any[]; onDone: () => void }) {
  const rowSym = currencySymbol(a.currency);
  const [editing, setEditing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [settleBankId, setSettleBankId] = useState("");
  const [newBal, setNewBal] = useState(a.initial_balance.toString());

  async function save() {
    const bal = parseFloat(newBal);
    if (!isNaN(bal)) {
      await api.accountPatch(a.id, { initial_balance: bal });
      setEditing(false);
      onDone();
    }
  }

  async function handleSettle() {
    if (!settleBankId) return;
    const bankId = parseInt(settleBankId);
    if (isNaN(bankId)) return;

    // To settle ANY account to exactly 0.00:
    // If the balance is positive (we overpaid them, or they owe us), we withdraw money FROM them TO the bank.
    // If the balance is negative (we owe them, or they overpaid us), we deposit money FROM the bank TO them.
    const flowToBank = a.balance > 0;
    const amount = Math.abs(a.balance);
    
    await api.addTxn({
      amount,
      category: "transfer",
      note: `Settle ${a.name}`,
      kind: "transfer",
      account_id: flowToBank ? a.id : bankId,
      to_account_id: flowToBank ? bankId : a.id,
    });
    setSettling(false);
    onDone();
  }

  const bankOptions = allAccounts.filter(acc => !["receivable", "payable"].includes(acc.type));
  const isDebt = ["receivable", "payable"].includes(a.type);
  const canSettle = isDebt && Math.abs(a.balance) > 0.009;

  return (
    <div className="group flex flex-wrap items-center justify-between gap-4 px-2 py-4">
      <div className="min-w-[120px]">
        <div className="font-semibold text-base">{a.name}</div>
        <div className="text-xs text-muted-foreground uppercase mt-0.5 border border-border inline-block px-1.5 rounded bg-secondary/30">{a.type.replace("_", " ")}</div>
      </div>
      <div className="text-right flex-1">
        <div className={`text-lg font-medium tabular-nums ${a.balance < 0 ? "text-destructive" : ""}`}>
          {a.balance < 0 ? "-" : ""}{rowSym}{Math.abs(a.balance).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </div>
        
        {editing ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5 mt-1">
            <span className="text-[10px] text-muted-foreground uppercase font-medium">Initial: {rowSym}</span>
            <input 
              type="number" 
              step="any"
              value={newBal} 
              onChange={e => setNewBal(e.target.value)} 
              className="w-24 rounded-md bg-secondary/80 border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary tabular-nums"
              onKeyDown={e => e.key === "Enter" && save()}
              autoFocus
            />
            <button onClick={save} className="text-[10px] bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:opacity-90 font-medium">Save</button>
            <button onClick={() => { setEditing(false); setNewBal(a.initial_balance.toString()); }} className="text-[10px] bg-secondary text-foreground border border-border px-2.5 py-1.5 rounded-md hover:bg-secondary/80 font-medium">Cancel</button>
          </div>
        ) : settling ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5 mt-1">
            <select
              value={settleBankId}
              onChange={e => setSettleBankId(e.target.value)}
              className="w-32 rounded-md bg-secondary/80 border border-border px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Select bank...</option>
              {bankOptions.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button onClick={handleSettle} disabled={!settleBankId} className="text-[10px] bg-primary text-primary-foreground px-2.5 py-1.5 rounded-md hover:opacity-90 font-medium disabled:opacity-50">Confirm</button>
            <button onClick={() => setSettling(false)} className="text-[10px] bg-secondary text-foreground border border-border px-2.5 py-1.5 rounded-md hover:bg-secondary/80 font-medium">Cancel</button>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground">Initial: {rowSym}{a.initial_balance}</div>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
        {!editing && !settling && canSettle && (
          <button onClick={() => setSettling(true)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-emerald-500 p-2 text-xs font-medium border border-border rounded-md px-2 py-1 flex items-center justify-center">
            Settle
          </button>
        )}
        {!editing && !settling && (
          <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-primary p-2">
            <Edit2 className="h-4 w-4" />
          </button>
        )}
        {!editing && !settling && (
          <button onClick={async () => {
            if (!confirm(`Delete account "${a.name}"? Transactions linked to it will NOT be deleted, but will lose their account link.`)) return;
            await api.accountDelete(a.id);
            onDone();
          }} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive p-2">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function AccountForm({ allAccounts, onDone }: { allAccounts: any[]; onDone: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"bank" | "cash" | "credit_card" | "receivable" | "payable">("bank");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("");
  const [fundingOption, setFundingOption] = useState<"historical" | "now">("historical");
  const [fundingBankId, setFundingBankId] = useState("");
  const { profile } = useProfile();

  useEffect(() => {
    if (profile?.currency) setCurrency(profile.currency);
  }, [profile]);

  const isDebt = type === "receivable" || type === "payable";
  const bankOptions = allAccounts.filter(acc => !["receivable", "payable"].includes(acc.type));

  async function add() {
    if (!name.trim()) return;
    const initial_balance = parseFloat(balance) || 0;
    
    let funding_account_id = null;
    if (isDebt && fundingOption === "now" && fundingBankId) {
      funding_account_id = parseInt(fundingBankId);
    }

    await api.accountAdd({ 
      name, 
      type, 
      currency, 
      initial_balance,
      funding_account_id
    });
    
    setName(""); setBalance(""); setType("bank"); setFundingOption("historical"); setFundingBankId("");
    onDone();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Account Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Chase Checking, John Doe"
          className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Type</label>
        <select value={type} onChange={e => setType(e.target.value as any)}
          className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
          <option value="bank">Bank Account</option>
          <option value="cash">Cash Wallet</option>
          <option value="credit_card">Credit Card (Liability)</option>
          <option value="receivable">Receivable (Someone owes you)</option>
          <option value="payable">Payable (You owe someone)</option>
        </select>
      </div>
      
      {isDebt && (
        <div className="p-2 border border-border rounded-md bg-secondary/20 space-y-2">
          <label className="text-[10px] uppercase font-semibold text-muted-foreground block">When did this happen?</label>
          <div className="flex gap-2">
            <button 
              onClick={() => setFundingOption("historical")} 
              className={`flex-1 rounded text-xs py-1.5 font-medium transition ${fundingOption === "historical" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>
              Already Given/Received
            </button>
            <button 
              onClick={() => setFundingOption("now")} 
              className={`flex-1 rounded text-xs py-1.5 font-medium transition ${fundingOption === "now" ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary/80"}`}>
              {type === "receivable" ? "Lending Now" : "Borrowing Now"}
            </button>
          </div>
          
          {fundingOption === "now" && (
            <div className="pt-1">
              <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">From/To Which Bank?</label>
              <select 
                value={fundingBankId} 
                onChange={e => setFundingBankId(e.target.value)}
                className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select bank account...</option>
                {bankOptions.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Currency</label>
          <input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="USD"
            className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-[10px] uppercase font-semibold text-muted-foreground mb-1 block">Amount</label>
          <input type="number" step="any" value={balance} onChange={e => setBalance(e.target.value)} placeholder="0.00"
            className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>
      <button onClick={add} className="w-full rounded-md bg-primary text-primary-foreground font-medium px-3 py-2 text-sm hover:opacity-90 flex items-center justify-center gap-2 mt-2">
        <Plus className="h-4 w-4" /> Add Account
      </button>
    </div>
  );
}
