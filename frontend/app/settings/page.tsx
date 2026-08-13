"use client";
import { useEffect, useState } from "react";
import { useProfile } from "@/lib/profile";
import type { Profile } from "@/lib/api";
import { api, apiBase } from "@/lib/api";
import { Card } from "@/components/card";
import { LLMSettings } from "@/components/llm-settings";
import { SecuritySettings } from "@/components/security-settings";
import { User, Settings, Database, Cpu, HardDrive, Lock } from "lucide-react";

type Tab = "profile" | "preferences" | "obsidian" | "integrations" | "security" | "data";
const VALID_TABS: Tab[] = ["profile", "preferences", "obsidian", "integrations", "security", "data"];

// Deep-link support: /settings?tab=security lands directly on that tab (used by the
// "not authorized" banner so a fresh device isn't left guessing which of six tabs
// holds the token field). Read directly from window.location instead of
// useSearchParams() so this page stays statically prerenderable (no Suspense needed
// for what's purely client-side initial state).
function initialTabFromUrl(): Tab {
  if (typeof window === "undefined") return "profile";
  const t = new URLSearchParams(window.location.search).get("tab");
  return (VALID_TABS as string[]).includes(t ?? "") ? (t as Tab) : "profile";
}

export default function Page() {
  const { profile, save } = useProfile();
  const [p, setP] = useState<Profile | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<Tab>(initialTabFromUrl);

  useEffect(() => { if (profile) setP(profile); }, [profile]);

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!p?.name?.trim()) { setErr("Name is required."); setStatus("err"); return; }
    setStatus("saving"); setErr("");
    try { await save({ ...p, dob: p.dob || null }); setStatus("saved"); setTimeout(() => setStatus("idle"), 1500); }
    catch (e: any) { setErr(e.message ?? "Save failed"); setStatus("err"); }
  }

  if (!p) return <div className="text-sm text-muted-foreground p-8">Loading settings…</div>;

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

  async function exportDb() {
    // Session auth is a cookie now, which rides along automatically on a same-origin
    // window.open() navigation — no token/query-param plumbing needed.
    window.open(`${apiBase()}/dev/export`, "_blank");
  }

  async function importDb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!confirm("WARNING: This will completely overwrite your existing database with the backup file. Are you absolutely sure?")) {
      e.target.value = "";
      return;
    }
    try {
      const res = await api.devImport(f);
      alert(res.message || "Database imported successfully! The backend will now restart.");
      // Hard refresh to clear cached frontend state
      setTimeout(() => window.location.reload(), 2000);
    } catch (err: any) {
      alert(String(err.message ?? err));
    }
    e.target.value = "";
  }

  const TABS = [
    { id: "profile", label: "Profile", icon: User },
    { id: "preferences", label: "Preferences", icon: Settings },
    { id: "obsidian", label: "Obsidian Sync", icon: Database },
    { id: "integrations", label: "Integrations & AI", icon: Cpu },
    { id: "security", label: "Security", icon: Lock },
    { id: "data", label: "Data Management", icon: HardDrive },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl 2xl:max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, preferences, and integrations.</p>
        </div>
        {(tab === "profile" || tab === "preferences" || tab === "obsidian") && (
          <div className="flex items-center gap-3">
            <div className="text-xs font-medium">
              {status === "saved" && <span className="text-emerald-500">Saved ✓</span>}
              {status === "err"   && <span className="text-destructive">{err}</span>}
            </div>
            <button onClick={() => submit()} disabled={status === "saving"}
              className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors shadow-sm">
              {status === "saving" ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        <aside className="w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-2 md:pb-0 border-b md:border-b-0 border-border/50">
          {TABS.map(t => (
            <button 
              key={t.id} 
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors whitespace-nowrap ${tab === t.id ? "bg-secondary text-foreground font-medium shadow-sm" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"}`}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </aside>

        <main className="flex-1 w-full min-w-0 pb-12">
          {tab === "profile" && (
            <Card title="Personal Profile">
              <div className="space-y-5 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Your name">
                    <input value={p.name} onChange={e => setP({ ...p, name: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="AI Alias" hint="Anime/Superhero character for privacy">
                    <input value={p.alias ?? ""} onChange={e => setP({ ...p, alias: e.target.value })}
                      placeholder="Goku" className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Date of birth">
                    <input type="date" value={p.dob ?? ""} onChange={e => setP({ ...p, dob: e.target.value })} className={inputCls} />
                  </Field>
                  <Field label="Pronouns">
                    <input value={p.pronouns ?? ""} onChange={e => setP({ ...p, pronouns: e.target.value })}
                      placeholder="he/him · she/her · they/them" className={inputCls} />
                  </Field>
                </div>
                <Field label="Your values" hint="comma-separated">
                  <input value={p.values ?? ""} onChange={e => setP({ ...p, values: e.target.value })}
                    placeholder="health, family, deep work" className={inputCls} />
                </Field>
                <Field label="Current focus" hint="one sentence">
                  <input value={p.goal ?? ""} onChange={e => setP({ ...p, goal: e.target.value })}
                    placeholder="ship LifeOS" className={inputCls} />
                </Field>
              </div>
            </Card>
          )}

          {tab === "preferences" && (
            <Card title="Preferences & Targets">
              <div className="space-y-5 mt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Timezone">
                    <input value={p.timezone ?? ""} onChange={e => setP({ ...p, timezone: e.target.value })}
                      placeholder="Asia/Kolkata" className={inputCls} />
                  </Field>
                  <Field label="Currency (code)">
                    <input value={p.currency ?? ""} onChange={e => setP({ ...p, currency: e.target.value.toUpperCase().slice(0, 6) })}
                      placeholder="USD · INR · EUR" className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Sleep target (hours)">
                    <input type="number" step="0.5" min={0} max={24}
                      value={p.sleep_target_hours ?? 8}
                      onChange={e => setP({ ...p, sleep_target_hours: parseFloat(e.target.value) || 8 })}
                      className={inputCls} />
                  </Field>
                  <Field label="Monthly Discretionary Budget" hint={`e.g. 1000`}>
                    <div className="relative">
                      <input type="number" step="any" min={0}
                        value={p.monthly_budget ?? ""}
                        onChange={e => setP({ ...p, monthly_budget: parseFloat(e.target.value) || null })}
                        className={inputCls} />
                    </div>
                  </Field>
                </div>
                <Field label="Fixed/Mandatory Categories" hint="comma-separated. Rent, Groceries, etc. (excluded from daily budget pacing)">
                  <input value={(typeof p.fixed_categories === 'string' ? JSON.parse(p.fixed_categories) : p.fixed_categories ?? []).join(", ")} 
                    onChange={e => setP({ ...p, fixed_categories: JSON.stringify(e.target.value.split(",").map(s=>s.trim()).filter(Boolean)) })}
                    placeholder="rent, utilities, groceries" className={inputCls} />
                </Field>
              </div>
            </Card>
          )}

          {tab === "obsidian" && (
            <Card title="Obsidian Sync">
              <div className="space-y-5 mt-2">
                <p className="text-sm text-muted-foreground mb-4">
                  LifeOS can write your daily entries directly to an Obsidian vault for permanent, private plain-text storage.
                </p>
                <Field label="Vault path" hint="absolute path on this machine (or /vault if running in Docker)">
                  <input value={p.vault_path ?? ""} onChange={e => setP({ ...p, vault_path: e.target.value })}
                    placeholder="/Users/you/Documents/Obsidian/MyVault" className={inputCls} />
                </Field>
                <Field label="Journal subfolder" hint="where daily notes get written inside the vault">
                  <input value={p.journal_subdir ?? ""} onChange={e => setP({ ...p, journal_subdir: e.target.value })}
                    placeholder="Journal" className={inputCls} />
                </Field>
              </div>
            </Card>
          )}

          {tab === "integrations" && (
            <LLMSettings />
          )}

          {tab === "security" && (
            <SecuritySettings />
          )}

          {tab === "data" && (
            <div className="space-y-6">
              <Card title="Export & Backup">
                <div className="space-y-5 mt-2">
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Download a full backup of your local SQLite database. This contains all your profile settings, journal entries, tasks, financial data, and LLM configuration.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={exportDb}
                      className="rounded-lg bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium transition-colors">
                      Download Database Backup
                    </button>
                    <label className="rounded-lg border border-border bg-secondary/80 hover:bg-secondary px-4 py-2 text-sm font-medium transition-colors cursor-pointer flex items-center">
                      Restore from Backup
                      <input type="file" accept=".db" onChange={importDb} className="hidden" />
                    </label>
                  </div>
                </div>
              </Card>

              <Card title="Demo Data & Reset">
                <div className="space-y-5 mt-2">
                  <div className="text-sm text-muted-foreground leading-relaxed">
                    Populate the app with 60 days of realistic random data to see how everything looks.
                    Or wipe everything (keeps your profile) if you want to start clean.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={seed}
                      className="rounded-lg bg-secondary/80 hover:bg-secondary px-4 py-2 text-sm font-medium transition-colors">
                      Seed 60 days of demo data
                    </button>
                    <button onClick={wipe}
                      className="rounded-lg border border-destructive/50 text-destructive hover:bg-destructive/10 px-4 py-2 text-sm font-medium transition-colors">
                      Wipe all logged data
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg bg-secondary/30 border border-border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-colors placeholder:text-muted-foreground/50";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/70 truncate">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
