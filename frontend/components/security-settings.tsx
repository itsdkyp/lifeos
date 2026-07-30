"use client";
import { useEffect, useState } from "react";
import { Card } from "@/components/card";
import { getAuthToken, setAuthToken, apiBase } from "@/lib/api";
import { Shield, ShieldCheck, ShieldAlert, RefreshCw, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function SecuritySettings() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "auth-off" | "authed" | "unauthed" | "err">("idle");
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const t = getAuthToken();
    if (t) setToken(t);
    checkStatus(t);
  }, []);

  async function checkStatus(t?: string | null) {
    setStatus("checking");
    setMsg("");
    try {
      // Probe an authed endpoint (/health is always open, doesn't tell us if auth is enabled).
      const r = await fetch(`${apiBase()}/profile`, {
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      if (r.status === 401) {
        setStatus(t ? "unauthed" : "unauthed");
        setMsg(t ? "Server rejected this token. Regenerate or check LIFEOS_TOKEN in backend/.env." : "Backend requires a token but none is set here.");
      } else if (r.status === 200) {
        setStatus(t ? "authed" : "auth-off");
        setMsg(t ? "Token accepted." : "Backend has no LIFEOS_TOKEN set — auth is disabled (fine on localhost, unsafe on remote).");
      } else {
        setStatus("err");
        setMsg(`Unexpected status: ${r.status}`);
      }
    } catch (e: any) {
      setStatus("err");
      setMsg(`Could not reach backend: ${e?.message ?? e}`);
    }
  }

  function generateToken() {
    // 32 bytes = 64 hex chars, matches `openssl rand -hex 32` on the backend side.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    setToken(hex);
    setSaved(false);
  }

  function saveToken() {
    const trimmed = token.trim();
    setAuthToken(trimmed || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    checkStatus(trimmed || null);
  }

  function clearToken() {
    setToken("");
    setAuthToken(null);
    checkStatus(null);
  }

  async function copyToClipboard() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const statusIcon =
    status === "authed"    ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> :
    status === "auth-off"  ? <Shield className="h-5 w-5 text-muted-foreground" /> :
    status === "unauthed"  ? <ShieldAlert className="h-5 w-5 text-amber-500" /> :
    status === "err"       ? <ShieldAlert className="h-5 w-5 text-destructive" /> :
                             <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <Card title="Backend Auth Token">
        <div className="space-y-5">
          <div className="text-sm text-muted-foreground leading-relaxed">
            When you expose the LifeOS backend beyond localhost (Tailscale, LAN, tunnel, VPS),
            you must set a shared secret token so only you can talk to it. Paste the same token
            into <code className="text-foreground bg-secondary/40 px-1.5 py-0.5 rounded text-xs">LIFEOS_TOKEN</code> in{" "}
            <code className="text-foreground bg-secondary/40 px-1.5 py-0.5 rounded text-xs">backend/.env</code>{" "}
            and restart the backend. If you leave it empty here AND on the backend, auth stays disabled.
          </div>

          <div className={cn("flex items-start gap-3 rounded-lg border p-3",
            status === "authed"    && "border-emerald-500/30 bg-emerald-500/5",
            status === "auth-off"  && "border-border bg-secondary/30",
            status === "unauthed" && "border-amber-500/30 bg-amber-500/5",
            status === "err"      && "border-destructive/30 bg-destructive/5",
            status === "checking" && "border-border bg-secondary/20",
          )}>
            <div className="mt-0.5">{statusIcon}</div>
            <div className="flex-1 text-sm">
              <div className="font-medium capitalize">
                {status === "checking" && "Checking…"}
                {status === "authed"   && "Authenticated"}
                {status === "auth-off" && "Auth disabled (localhost-only)"}
                {status === "unauthed" && "Not authorized"}
                {status === "err"      && "Backend unreachable"}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{msg}</div>
            </div>
            <button onClick={() => checkStatus(token || null)}
              className="rounded-md bg-secondary hover:bg-secondary/80 px-3 py-1.5 text-xs font-medium">
              Re-check
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Token (64 hex chars)</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={token}
                onChange={e => { setToken(e.target.value); setSaved(false); }}
                placeholder="paste or generate a 64-char hex token"
                className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={copyToClipboard} disabled={!token}
                className="rounded-md bg-secondary hover:bg-secondary/80 border border-border px-3 py-2 text-xs font-medium disabled:opacity-40 flex items-center gap-1.5">
                {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={generateToken}
              className="rounded-md bg-secondary hover:bg-secondary/80 border border-border px-4 py-2 text-sm font-medium">
              Generate random token
            </button>
            <button onClick={saveToken}
              className="rounded-md bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-sm font-medium">
              {saved ? "Saved ✓" : "Save token in this browser"}
            </button>
            {token && (
              <button onClick={clearToken}
                className="rounded-md text-destructive hover:bg-destructive/10 border border-destructive/30 px-4 py-2 text-sm font-medium">
                Clear
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card title="How to expose LifeOS beyond localhost">
        <div className="space-y-5 text-sm leading-relaxed">
          <div>
            <div className="font-medium mb-1">Option A — Tailscale (recommended for personal use)</div>
            <ol className="space-y-1 text-muted-foreground list-decimal ml-5 text-xs">
              <li>Install Tailscale on your Mac + phone from tailscale.com.</li>
              <li>Set <code className="text-foreground bg-secondary/40 px-1 rounded">LIFEOS_BIND=0.0.0.0</code> and generate + set <code className="text-foreground bg-secondary/40 px-1 rounded">LIFEOS_TOKEN</code> in <code className="text-foreground bg-secondary/40 px-1 rounded">backend/.env</code>.</li>
              <li>Restart backend. From your phone browser, visit <code className="text-foreground bg-secondary/40 px-1 rounded">http://YOUR-MAC-NAME:3000</code> (Tailscale MagicDNS).</li>
              <li>Paste the same token into the field above from your phone — done.</li>
            </ol>
          </div>
          <div>
            <div className="font-medium mb-1">Option B — Same-Wi-Fi LAN only</div>
            <ol className="space-y-1 text-muted-foreground list-decimal ml-5 text-xs">
              <li>Same as A steps 2–4, but you use your Mac's LAN IP (e.g. <code className="text-foreground bg-secondary/40 px-1 rounded">192.168.1.42:3000</code>) from your phone.</li>
              <li>Anyone else on the same Wi-Fi with the token can reach you — that's why the token matters.</li>
            </ol>
          </div>
          <div>
            <div className="font-medium mb-1">Option C — Cloudflare Tunnel (public HTTPS URL)</div>
            <ol className="space-y-1 text-muted-foreground list-decimal ml-5 text-xs">
              <li>Install <code className="text-foreground bg-secondary/40 px-1 rounded">cloudflared</code>, run <code className="text-foreground bg-secondary/40 px-1 rounded">cloudflared tunnel --url http://localhost:3000</code>.</li>
              <li>You'll get a public <code className="text-foreground bg-secondary/40 px-1 rounded">*.trycloudflare.com</code> URL.</li>
              <li>Token is your only defense — pick a strong one, keep it in a password manager.</li>
            </ol>
          </div>
        </div>
      </Card>
    </div>
  );
}
