"use client";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import type { Profile } from "@/lib/api";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { LLMSettings } from "@/components/llm-settings";

export default function Page() {
  const { profile, save } = useProfile();
  const [p, setP] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [err, setErr] = useState("");

  useEffect(() => { if (profile) setP(profile); }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!p?.name?.trim()) { setErr("Name is required."); setStatus("err"); return; }
    setStatus("saving"); setErr("");
    try { await save({ ...p, dob: p.dob || null }); setStatus("saved"); setTimeout(() => setStatus("idle"), 1500); }
    catch (e: any) { setErr(e.message ?? "Save failed"); setStatus("err"); }
  }

  if (!p) return <div className="text-sm text-muted-foreground">Loading…</div>;

  async function seed() {
    if (!confirm("Add 60 days of realistic demo data?")) return;
    const r = await api.devSeed(60);
    alert(`Seeded ${r.seeded_days} days. Reload the dashboard to see charts.`);
  }
  async function wipe() {
    if (!confirm("WIPE all logged data (journal, finance, mood, tasks, sleep, weight, meals, habits, wins, gratitude)?\nProfile is kept.")) return;
    await api.devWipe();
    alert("Wiped.");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Everything here personalizes the app for you.</p>
      </header>

      <form onSubmit={submit}>
        <Card>
          <div className="space-y-4">
            <Field label="Your name">
              <input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} className={inputCls} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of birth">
                <input type="date" value={p.dob ?? ""} onChange={e => setP({ ...p, dob: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Pronouns">
                <input value={p.pronouns ?? ""} onChange={e => setP({ ...p, pronouns: e.target.value })}
                  placeholder="he/him · she/her · they/them" className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Timezone">
                <input value={p.timezone ?? ""} onChange={e => setP({ ...p, timezone: e.target.value })}
                  placeholder="Asia/Kolkata" className={inputCls} />
              </Field>
              <Field label="Currency (code)">
                <input value={p.currency ?? ""} onChange={e => setP({ ...p, currency: e.target.value.toUpperCase().slice(0, 6) })}
                  placeholder="USD · INR · EUR" className={inputCls} />
              </Field>
            </div>
            <Field label="Sleep target (hours)">
              <input type="number" step="0.5" min={0} max={24}
                value={p.sleep_target_hours ?? 8}
                onChange={e => setP({ ...p, sleep_target_hours: parseFloat(e.target.value) || 8 })}
                className={inputCls} />
            </Field>
            <Field label="Your values" hint="comma-separated">
              <input value={p.values ?? ""} onChange={e => setP({ ...p, values: e.target.value })}
                placeholder="health, family, deep work" className={inputCls} />
            </Field>
            <Field label="Current focus" hint="one sentence">
              <input value={p.goal ?? ""} onChange={e => setP({ ...p, goal: e.target.value })}
                placeholder="ship LifeOS" className={inputCls} />
            </Field>

            <div className="pt-2 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Obsidian sync</div>
              <div className="space-y-3">
                <Field label="Vault path" hint="absolute path on this machine (or /vault if running in Docker)">
                  <input value={p.vault_path ?? ""} onChange={e => setP({ ...p, vault_path: e.target.value })}
                    placeholder="/Users/you/Documents/Obsidian/MyVault" className={inputCls} />
                </Field>
                <Field label="Journal subfolder" hint="where daily notes get written inside the vault">
                  <input value={p.journal_subdir ?? ""} onChange={e => setP({ ...p, journal_subdir: e.target.value })}
                    placeholder="Journal" className={inputCls} />
                </Field>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="text-xs">
              {status === "saved" && <span className="text-emerald-500">Saved ✓</span>}
              {status === "err"   && <span className="text-destructive">{err}</span>}
            </div>
            <button type="submit" disabled={status === "saving"}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {status === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </Card>
      </form>

      <LLMSettings />

      <Card title="Demo data">
        <div className="text-xs text-muted-foreground mb-3">
          Populate the app with 60 days of realistic random data to see how everything looks.
          Or wipe everything (keeps your profile) if you want to start clean.
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={seed}
            className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-2 text-sm">
            Seed 60 days of demo data
          </button>
          <button onClick={wipe}
            className="rounded-md border border-destructive/50 text-destructive hover:bg-destructive/10 px-3 py-2 text-sm">
            Wipe all logged data
          </button>
        </div>
      </Card>
    </div>
  );
}

const inputCls = "w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
