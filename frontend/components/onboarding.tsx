"use client";
import { useState } from "react";
import { useProfile } from "@/lib/profile";
import type { Profile } from "@/lib/api";
import { Sparkles } from "lucide-react";

function defaultTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
}
function defaultCurrency() {
  try {
    const locale = navigator.language ?? "en-US";
    const nf = new Intl.NumberFormat(locale, { style: "currency", currency: "USD" });
    // fetch region-specific default via Intl.Locale
    const region = new Intl.Locale(locale).maximize().region;
    const map: Record<string, string> = { US: "USD", IN: "INR", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR", JP: "JPY", CN: "CNY", AU: "AUD", CA: "CAD" };
    return map[region ?? ""] ?? "USD";
  } catch { return "USD"; }
}

export function OnboardingModal({ open }: { open: boolean }) {
  const { save } = useProfile();
  const [p, setP] = useState<Profile>({
    name: "", dob: "", pronouns: "",
    timezone: defaultTz(), currency: defaultCurrency(),
    sleep_target_hours: 8, values: "", goal: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!open) return null;

  async function submit() {
    if (!p.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr("");
    try { await save({ ...p, dob: p.dob || null }); }
    catch (e: any) { setErr(e.message ?? "Could not save."); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Welcome to LifeOS</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Tell me a bit about yourself. Everything can be changed later in Settings.</p>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <Field label="Your name *">
            <input value={p.name} onChange={e => setP({ ...p, name: e.target.value })}
              autoFocus placeholder="Dileep" className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date of birth" hint="used to show your age">
              <input type="date" value={p.dob ?? ""} onChange={e => setP({ ...p, dob: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Pronouns" hint="optional">
              <input value={p.pronouns ?? ""} onChange={e => setP({ ...p, pronouns: e.target.value })}
                placeholder="he/him · she/her · they/them" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency">
              <input value={p.currency ?? ""} onChange={e => setP({ ...p, currency: e.target.value.toUpperCase().slice(0,6) })}
                placeholder="USD, INR, EUR…" className={inputCls} />
            </Field>
            <Field label="Sleep target (hours)">
              <input type="number" step="0.5" min={0} max={24}
                value={p.sleep_target_hours ?? 8}
                onChange={e => setP({ ...p, sleep_target_hours: parseFloat(e.target.value) || 8 })}
                className={inputCls} />
            </Field>
          </div>

          <Field label="Your values" hint="what matters most, comma-separated (guides your weekly review)">
            <input value={p.values ?? ""} onChange={e => setP({ ...p, values: e.target.value })}
              placeholder="health, family, deep work, calm" className={inputCls} />
          </Field>

          <Field label="Current focus" hint="one sentence — the thing you're working on now">
            <input value={p.goal ?? ""} onChange={e => setP({ ...p, goal: e.target.value })}
              placeholder="ship LifeOS · run a 10k · learn Rust" className={inputCls} />
          </Field>

          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={submit} disabled={busy}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {busy ? "Saving…" : "Let's go"}
          </button>
        </div>
      </div>
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
