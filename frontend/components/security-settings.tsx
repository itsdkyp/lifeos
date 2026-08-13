"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/card";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { KeyRound, LogOut, Plus, Trash2, Copy, Check } from "lucide-react";

export function SecuritySettings() {
  return (
    <div className="space-y-6">
      <AccountCard />
      <ChangePasswordCard />
      <ApiTokensCard />
    </div>
  );
}

function AccountCard() {
  const { logout } = useAuth();
  const [busy, setBusy] = useState(false);
  async function doLogout() {
    setBusy(true);
    try { await logout(); } finally { setBusy(false); }
  }
  return (
    <Card title="Account">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground leading-relaxed">
          You're logged in on this browser. Logging out ends this session immediately —
          you'll need your username and password to get back in.
        </div>
        <button onClick={doLogout} disabled={busy}
          className="shrink-0 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 px-4 py-2 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
          <LogOut className="h-3.5 w-3.5" /> {busy ? "Logging out…" : "Log out"}
        </button>
      </div>
    </Card>
  );
}

function ChangePasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { setErr("New password must be at least 8 characters."); setStatus("err"); return; }
    if (next !== confirm) { setErr("Passwords don't match."); setStatus("err"); return; }
    setStatus("saving"); setErr("");
    try {
      await api.sessionChangePassword(current, next);
      setStatus("saved");
      setCurrent(""); setNext(""); setConfirm("");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e: any) {
      setErr(e?.status === 401 ? "Current password is incorrect." : (e?.message ?? "Failed to change password."));
      setStatus("err");
    }
  }

  return (
    <Card title="Change Password">
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
          placeholder="Current password" className={inputCls} />
        <input type="password" value={next} onChange={e => setNext(e.target.value)}
          placeholder="New password (8+ characters)" className={inputCls} />
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="Confirm new password" className={inputCls} />
        {err && <div className="text-sm text-destructive">{err}</div>}
        <button disabled={status === "saving"}
          className="rounded-md bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Change password"}
        </button>
      </form>
    </Card>
  );
}

type ApiToken = { id: number; name: string; created_at: string; last_used_at: string | null };

function ApiTokensCard() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    try { setTokens(await api.apiTokens()); } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await api.apiTokenCreate(newName.trim());
      setRevealed({ name: r.name, token: r.token });
      setNewName("");
      await load();
    } catch {} finally { setCreating(false); }
  }

  async function revoke(id: number) {
    if (!confirm("Revoke this token? Anything using it will immediately lose access.")) return;
    await api.apiTokenDelete(id);
    await load();
  }

  async function copyToken() {
    if (!revealed) return;
    try { await navigator.clipboard.writeText(revealed.token); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  return (
    <Card title="API Tokens">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          For MCP clients (Claude Desktop, Cursor), scripts, or curl — not for browser login.
          Generate a token, use it as{" "}
          <code className="text-foreground bg-secondary/40 px-1.5 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
          Each token is shown once, at creation. Revoke any time.
        </p>

        {revealed && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
            <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              "{revealed.name}" created — copy this now, it won't be shown again:
            </div>
            <div className="flex gap-2">
              <code className="flex-1 rounded bg-secondary/60 px-2 py-1.5 text-xs font-mono break-all">{revealed.token}</code>
              <button onClick={copyToken}
                className="shrink-0 rounded-md bg-secondary hover:bg-secondary/80 border border-border px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
            <button onClick={() => setRevealed(null)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
              Done, dismiss
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Token name, e.g. 'Claude Desktop'"
            className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button onClick={create} disabled={creating || !newName.trim()}
            className="shrink-0 rounded-md bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> {creating ? "Creating…" : "Generate"}
          </button>
        </div>

        <div className="divide-y divide-border/50 rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="p-4 text-sm text-muted-foreground text-center">Loading…</div>
          ) : tokens.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">No API tokens yet.</div>
          ) : tokens.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 text-sm">
              <div>
                <div className="font-medium flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" /> {t.name}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Created {new Date(t.created_at).toLocaleDateString()}
                  {t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}` : " · never used"}
                </div>
              </div>
              <button onClick={() => revoke(t.id)}
                className="shrink-0 rounded-md text-destructive hover:bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-medium flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

const inputCls = "w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring";
