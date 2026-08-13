"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Sparkles, Lock } from "lucide-react";

// Blocks ALL app content (nav, data fetches, everything) until the user is logged in.
// Two states: no account configured yet (first run -> mandatory setup form), or
// configured-but-not-authenticated (every subsequent visit -> login form). Unlike the
// old token-paste banner this fully replaced, there is no partial/degraded view here —
// nothing renders behind the gate.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, configured, authenticated, login, setup } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!configured) return <SetupForm onSubmit={setup} />;
  if (!authenticated) return <LoginForm onSubmit={login} />;
  return <>{children}</>;
}

function GateShell({ icon: Icon, title, subtitle, children }: { icon: any; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-primary">
          <Icon className="h-5 w-5" />
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

function SetupForm({ onSubmit }: { onSubmit: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (username.trim().length < 3) { setErr("Username must be at least 3 characters."); return; }
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr("");
    try { await onSubmit(username.trim(), password); }
    catch (e: any) { setErr(e?.message?.replace(/^\d+\s*/, "") || "Setup failed."); }
    finally { setBusy(false); }
  }

  return (
    <GateShell icon={Sparkles} title="Secure your LifeOS"
      subtitle="Create the login for this instance. There's no recovery flow if you forget it — write it down somewhere safe.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <input autoFocus value={username} onChange={e => setUsername(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Password" hint="8+ characters">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Confirm password">
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} className={inputCls} />
        </Field>
        {err && <div className="text-sm text-destructive">{err}</div>}
        <button disabled={busy}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {busy ? "Creating…" : "Create account"}
        </button>
      </form>
    </GateShell>
  );
}

function LoginForm({ onSubmit }: { onSubmit: (u: string, p: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await onSubmit(username, password); }
    catch (e: any) {
      setErr(e?.status === 429 ? "Too many failed attempts. Wait a few minutes and try again." : "Invalid username or password.");
    } finally { setBusy(false); }
  }

  return (
    <GateShell icon={Lock} title="Log in to LifeOS">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Username">
          <input autoFocus value={username} onChange={e => setUsername(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Password">
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputCls} />
        </Field>
        {err && <div className="text-sm text-destructive">{err}</div>}
        <button disabled={busy}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </GateShell>
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
