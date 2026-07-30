"use client";
import { useEffect, useState } from "react";
import { api, type LLMConfig } from "@/lib/api";
import { Card } from "@/components/card";
import { CheckCircle2, XCircle, Loader2, ExternalLink, LogIn, LogOut } from "lucide-react";
import { CopilotSignIn, AnthropicSignIn, GoogleSignIn } from "./oauth-modals";

type Provider = { id: string; label: string; baseUrl: string; defaultModel: string; needsKey: boolean };

export function LLMSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [cfg, setCfg] = useState<LLMConfig | null>(null);
  const [form, setForm] = useState<{ provider: string; api_key: string; model: string; base_url: string; auth_type: "api_key" | "oauth"; context_days: number }>({
    provider: "openai", api_key: "", model: "", base_url: "", auth_type: "api_key", context_days: 30
  });
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "err">("idle");
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "err">("idle");
  const [testMsg, setTestMsg] = useState("");
  const [authStatus, setAuthStatus] = useState<{ github_copilot: boolean; anthropic: boolean; google: boolean }>({ github_copilot: false, anthropic: false, google: false });
  const [oauthModal, setOauthModal] = useState<"copilot" | "anthropic" | "google" | null>(null);

  const refreshAuth = () => api.authStatus().then(setAuthStatus).catch(() => {});

  useEffect(() => {
    api.llmProviders().then(setProviders).catch(() => {});
    api.llmConfig().then(c => {
      setCfg(c);
      if (c) setForm({ provider: c.provider, api_key: "", model: c.model, base_url: c.base_url ?? "", auth_type: (c as any).auth_type ?? "api_key", context_days: (c as any).context_days ?? 30 });
    }).catch(() => {});
    refreshAuth();
  }, []);

  const selected = providers.find(p => p.id === form.provider);

  function pickProvider(id: string) {
    const p = providers.find(x => x.id === id);
    if (!p) return;
    // Force OAuth for copilot; default OAuth also available for anthropic
    const auth_type: "api_key" | "oauth" =
      id === "github_copilot" ? "oauth" :
      id === "anthropic"     ? form.auth_type : "api_key";
    setForm(f => ({
      ...f,
      provider: id,
      model: id === "github_copilot" ? "claude-sonnet-4.5" : p.defaultModel,
      base_url: (id === "custom" || id === "ollama") ? p.baseUrl : "",
      api_key: "",
      auth_type,
    }));
  }

  async function save() {
    setStatus("saving");
    try {
      const payload: any = { provider: form.provider, model: form.model, base_url: form.base_url || null, auth_type: form.auth_type, context_days: form.context_days };
      if (form.api_key) payload.api_key = form.api_key;
      await api.llmSave(payload);
      const c = await api.llmConfig(); setCfg(c);
      setForm(f => ({ ...f, api_key: "" }));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e: any) {
      setStatus("err");
      setTestMsg(String(e.message ?? e));
    }
  }

  async function test() {
    setTestState("testing"); setTestMsg("");
    try {
      const r = await api.llmTest();
      if (r.ok) { setTestState("ok"); setTestMsg(r.reply ?? "OK"); }
      else       { setTestState("err"); setTestMsg(r.error ?? "failed"); }
    } catch (e: any) { setTestState("err"); setTestMsg(String(e.message ?? e)); }
  }

  return (
    <Card title="LLM">
      <div className="text-xs text-muted-foreground mb-4">
        Pick a provider, paste an API key. Chat and Weekly Review use this.
      </div>

      <div className="space-y-4">
        <Field label="Provider">
          <select value={form.provider} onChange={e => pickProvider(e.target.value)} className={inputCls}>
            {providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Field>

        {selected?.needsKey && form.auth_type === "api_key" && (
          <Field label="API key" hint={cfg?.has_key && cfg.provider === form.provider ? `current: ${cfg.api_key} (leave blank to keep)` : "required"}>
            <input type="password" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })}
              placeholder={apiKeyPlaceholder(form.provider)} className={inputCls} />
          </Field>
        )}

        {/* Auth-type toggle for providers where OAuth is available */}
        {form.provider === "anthropic" && (
          <div className="flex gap-2">
            <button onClick={() => setForm(f => ({ ...f, auth_type: "api_key" }))}
              className={`flex-1 rounded-md px-3 py-2 text-xs ${form.auth_type === "api_key" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>
              Use API key
            </button>
            <button onClick={() => setForm(f => ({ ...f, auth_type: "oauth" }))}
              className={`flex-1 rounded-md px-3 py-2 text-xs ${form.auth_type === "oauth" ? "bg-primary text-primary-foreground" : "bg-secondary/50"}`}>
              Sign in with Claude Pro/Max
            </button>
          </div>
        )}

        {/* OAuth sign-in / logout controls */}
        {form.auth_type === "oauth" && (form.provider === "github_copilot" || form.provider === "anthropic") && (
          <div className="rounded-md border border-border bg-secondary/30 p-3 flex items-center justify-between">
            <div className="text-xs">
              {form.provider === "github_copilot" && (
                authStatus.github_copilot ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Signed in to GitHub Copilot</span>
                                          : <span className="text-muted-foreground">Not signed in.</span>
              )}
              {form.provider === "anthropic" && (
                authStatus.anthropic ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Signed in to Claude</span>
                                     : <span className="text-muted-foreground">Not signed in.</span>
              )}
            </div>
            {(form.provider === "github_copilot" ? authStatus.github_copilot : authStatus.anthropic) ? (
              <button onClick={async () => { await api.authLogout(form.provider as any); refreshAuth(); }}
                className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs flex items-center gap-1">
                <LogOut className="h-3.5 w-3.5" /> Log out
              </button>
            ) : (
              <button onClick={() => setOauthModal(form.provider === "github_copilot" ? "copilot" : "anthropic")}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs flex items-center gap-1">
                <LogIn className="h-3.5 w-3.5" /> Sign in
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Model">
            {form.provider === "gemini" ? (
              <>
                <input list="gemini-models" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
                  placeholder={selected?.defaultModel} className={inputCls} />
                <datalist id="gemini-models">
                  <option value="gemini-3.6-flash" />
                  <option value="gemini-3.5-flash" />
                  <option value="gemini-3.5-flash-lite" />
                  <option value="gemini-3.1-pro" />
                  <option value="gemini-3-flash" />
                  <option value="gemini-3.1-flash-live" />
                  <option value="gemini-omni-flash" />
                  <option value="gemini-2.5-flash" />
                </datalist>
              </>
            ) : (
              <input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder={selected?.defaultModel} className={inputCls} />
            )}
          </Field>
          <Field label="Base URL" hint="override (ollama, self-hosted, custom)">
            <input value={form.base_url} onChange={e => setForm({ ...form, base_url: e.target.value })}
              placeholder={selected?.baseUrl} className={inputCls} />
          </Field>
          <Field label="Context Window (Days)" hint="amount of history sent to LLM">
            <input type="number" min="1" max="365" value={form.context_days} onChange={e => setForm({ ...form, context_days: parseInt(e.target.value) || 30 })}
              className={inputCls} />
          </Field>
        </div>

        {form.provider === "github_copilot" && form.auth_type === "oauth" && (
          <div className="text-xs rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-blue-400">
            Direct browser sign-in with your GitHub Copilot subscription. No LiteLLM proxy needed.
          </div>
        )}
        {form.provider === "ollama" && (
          <div className="text-xs rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-blue-400">
            Local & free. <a href="https://ollama.com" target="_blank" className="underline inline-flex items-center gap-0.5">install ollama <ExternalLink className="h-3 w-3" /></a> then <code>ollama pull {form.model || "llama3.2"}</code>.
          </div>
        )}
        {form.provider === "groq" && (
          <div className="text-xs rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-emerald-400">
            Free tier, fast. Key at <a href="https://console.groq.com/keys" target="_blank" className="underline inline-flex items-center gap-0.5">console.groq.com/keys <ExternalLink className="h-3 w-3" /></a>.
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button onClick={test} disabled={testState === "testing" || !cfg}
            className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-50">
            {testState === "testing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
              testState === "ok"      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> :
              testState === "err"     ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : null}
            Test connection
          </button>
          <button onClick={save} disabled={status === "saving"}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
            {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : "Save"}
          </button>
        </div>

        {testMsg && (
          <div className={`text-xs ${testState === "ok" ? "text-emerald-500" : "text-destructive"}`}>
            {testState === "ok" ? `reply: ${testMsg}` : `error: ${testMsg}`}
          </div>
        )}
      </div>

      {oauthModal === "copilot"   && <CopilotSignIn   onClose={() => { setOauthModal(null); refreshAuth(); }} onSuccess={refreshAuth} />}
      {oauthModal === "anthropic" && <AnthropicSignIn onClose={() => { setOauthModal(null); refreshAuth(); }} onSuccess={refreshAuth} />}

      <div className="pt-6 mt-6 border-t border-border">
        <h3 className="text-sm font-semibold mb-2">Integrations</h3>
        <p className="text-xs text-muted-foreground mb-4">Connect external services to sync data.</p>
        
        <div className="rounded-md border border-border bg-secondary/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs">
              <div className="font-medium mb-1">Google Calendar</div>
              {authStatus.google ? <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Connected (Permanent)</span>
                                 : <span className="text-muted-foreground">Sync events via OAuth (requires Client ID & Secret)</span>}
            </div>
            {authStatus.google ? (
              <button onClick={async () => { await api.authLogout("google"); refreshAuth(); }}
                className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs flex items-center gap-1 shrink-0">
                <LogOut className="h-3.5 w-3.5" /> Disconnect
              </button>
            ) : (
              <button onClick={() => setOauthModal("google")}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs flex items-center gap-1 shrink-0">
                <LogIn className="h-3.5 w-3.5" /> Connect
              </button>
            )}
          </div>
        </div>
      </div>
      {oauthModal === "google" && <GoogleSignIn onClose={() => { setOauthModal(null); refreshAuth(); }} onSuccess={refreshAuth} />}
    </Card>
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

function apiKeyPlaceholder(provider: string): string {
  switch (provider) {
    case "openai":     return "sk-...";
    case "anthropic":  return "sk-ant-...";
    case "gemini":     return "AIza...";
    case "groq":       return "gsk_...";
    case "mistral":    return "...";
    case "deepseek":   return "sk-...";
    case "openrouter": return "sk-or-v1-...";
    default:           return "";
  }
}
