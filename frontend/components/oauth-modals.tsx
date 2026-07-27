"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { X, ExternalLink, Copy, CheckCircle2, Loader2 } from "lucide-react";

export function CopilotSignIn({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [state, setState] = useState<"loading" | "waiting" | "done" | "error">("loading");
  const [d, setD] = useState<{ user_code: string; verification_uri: string; device_code: string } | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const start = await api.copilotStart();
        if (stop) return;
        setD(start); setState("waiting");
        window.open(start.verification_uri, "_blank");
        while (!stop) {
          await new Promise(r => setTimeout(r, 5000));
          if (stop) break;
          const r = await api.copilotPoll(start.device_code);
          if (r.status === "complete") { setState("done"); onSuccessRef.current(); break; }
          if (r.status === "failed")   { setState("error"); setErr(r.error ?? "failed"); break; }
        }
      } catch (e: any) { setState("error"); setErr(String(e.message ?? e)); }
    })();
    return () => { stop = true; };
  }, []);   // ← empty: run once on mount, don't restart flow on parent re-render

  return (
    <Modal onClose={onClose} title="Sign in with GitHub Copilot">
      {state === "loading" && <div className="text-sm text-muted-foreground">Requesting device code…</div>}
      {state === "error"   && <div className="text-sm text-destructive">Error: {err}</div>}
      {(state === "waiting" || state === "done") && d && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A browser tab opened to <a href={d.verification_uri} target="_blank" className="underline inline-flex items-center gap-0.5">github.com/login/device <ExternalLink className="h-3 w-3" /></a>. Paste this code:
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 rounded-md bg-secondary/50 border border-border px-4 py-3 text-center text-2xl font-mono tracking-widest tabular-nums select-all">
              {d.user_code}
            </div>
            <button onClick={() => { navigator.clipboard.writeText(d.user_code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-3">
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            {state === "waiting" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for authorization…</>
                                 : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Signed in ✓</>}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function AnthropicSignIn({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [state, setState] = useState<"loading" | "waiting" | "manual" | "done" | "error">("loading");
  const [authUrl, setAuthUrl] = useState("");
  const [manual, setManual] = useState("");
  const [err, setErr] = useState("");
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const s = await api.anthropicStart();
        if (stop) return;
        setAuthUrl(s.auth_url);
        window.open(s.auth_url, "_blank");
        setState("waiting");
        while (!stop) {
          await new Promise(r => setTimeout(r, 2000));
          if (stop) break;
          const r = await api.anthropicPoll();
          if (r.status === "complete") { setState("done"); onSuccessRef.current(); break; }
          if (r.status === "failed")   { setState("error"); setErr(r.error ?? "failed"); break; }
        }
      } catch (e: any) { setState("error"); setErr(String(e.message ?? e)); }
    })();
    return () => { stop = true; };
  }, []);

  async function submitManual() {
    if (!manual.trim()) return;
    const r = await api.anthropicManual(manual);
    if (r.status === "complete") { setState("done"); onSuccess(); }
    else                          { setState("error"); setErr(r.error ?? "failed"); }
  }

  return (
    <Modal onClose={onClose} title="Sign in with Claude Pro/Max">
      {state === "loading" && <div className="text-sm text-muted-foreground">Preparing sign-in…</div>}
      {state === "error"   && <div className="text-sm text-destructive">Error: {err}</div>}
      {(state === "waiting" || state === "done") && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A browser tab opened for Claude sign-in. After you approve, you'll be redirected back automatically.
          </p>
          <a href={authUrl} target="_blank" className="inline-flex items-center gap-1 text-sm text-primary underline">
            Open sign-in link again <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {state === "waiting" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Waiting for redirect…</>
                                 : <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Signed in ✓</>}
          </div>

          <details className="pt-2">
            <summary className="text-xs text-muted-foreground cursor-pointer">Browser is on a different machine? paste redirect URL</summary>
            <div className="mt-2 flex gap-2">
              <input value={manual} onChange={e => setManual(e.target.value)}
                placeholder="http://localhost:53692/callback?code=..."
                className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none" />
              <button onClick={submitManual}
                className="rounded-md bg-primary text-primary-foreground px-3 text-sm">Use</button>
            </div>
          </details>
        </div>
      )}
    </Modal>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
           className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
