/**
 * OAuth flows: GitHub Copilot (device code) + Anthropic Claude Pro/Max (PKCE).
 *
 * ponytail: reuses public client IDs from pi's implementation. These are the
 * same OAuth apps VS Code / claude.ai already expose for CLI tools. Fine for
 * personal use; register your own client_id if you distribute.
 */
import { q1, run } from "./db.ts";
import { createServer, type Server } from "node:http";
import { randomBytes, createHash } from "node:crypto";

const now = () => new Date().toISOString();
const decode = (s: string) => Buffer.from(s, "base64").toString("utf-8");

// ══════════════════════════════════════════════════════════════════════
//  Token storage (shared)
// ══════════════════════════════════════════════════════════════════════
export type StoredToken = { refresh_token: string | null; access_token: string | null; expires_at: number | null; meta: any };

export function saveToken(provider: string, t: Partial<StoredToken>) {
  const existing = getToken(provider);
  const merged: StoredToken = {
    refresh_token: t.refresh_token ?? existing?.refresh_token ?? null,
    access_token:  t.access_token  ?? existing?.access_token  ?? null,
    expires_at:    t.expires_at    ?? existing?.expires_at    ?? null,
    meta:          t.meta          ?? existing?.meta          ?? null,
  };
  run(`INSERT INTO oauth_tokens(provider,refresh_token,access_token,expires_at,meta,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(provider) DO UPDATE SET
         refresh_token=excluded.refresh_token,
         access_token=excluded.access_token,
         expires_at=excluded.expires_at,
         meta=excluded.meta,
         updated_at=excluded.updated_at`,
      provider, merged.refresh_token, merged.access_token, merged.expires_at,
      merged.meta ? JSON.stringify(merged.meta) : null, now());
}

export function getToken(provider: string): StoredToken | null {
  const row = q1<any>("SELECT refresh_token, access_token, expires_at, meta FROM oauth_tokens WHERE provider=?", provider);
  if (!row) return null;
  return { ...row, meta: row.meta ? JSON.parse(row.meta) : null };
}

export function clearToken(provider: string) { run("DELETE FROM oauth_tokens WHERE provider=?", provider); }

// ══════════════════════════════════════════════════════════════════════
//  GitHub Copilot — device code flow
// ══════════════════════════════════════════════════════════════════════
const COPILOT_CLIENT_ID = decode("SXYxLmI1MDdhMDhjODdlY2ZlOTg=");
const COPILOT_HEADERS = {
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "Copilot-Integration-Id": "vscode-chat",
};

// In-memory device sessions (keyed by device_code).
const copilotSessions = new Map<string, {
  user_code: string; verification_uri: string;
  interval: number; expires_at: number;
  domain: string;
}>();

// SSRF guard: only allow github.com and .ghe.com (GitHub Enterprise) subdomains.
function validateCopilotDomain(input?: string): string {
  const domain = (input || "github.com").toLowerCase().trim();
  if (domain === "github.com") return domain;
  if (/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.ghe\.com$/.test(domain)) return domain;
  throw new Error(`Rejected enterprise domain "${domain}". Only github.com or *.ghe.com is allowed.`);
}

export async function copilotStartDevice(enterpriseDomain?: string): Promise<{
  user_code: string; verification_uri: string; device_code: string; interval: number; expires_in: number;
}> {
  const domain = validateCopilotDomain(enterpriseDomain);
  const r = await fetch(`https://${domain}/login/device/code`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GitHubCopilotChat/0.35.0" },
    body: new URLSearchParams({ client_id: COPILOT_CLIENT_ID, scope: "read:user" }),
  });
  if (!r.ok) throw new Error(`device code failed: ${r.status}`);
  const d = await r.json() as any;
  copilotSessions.set(d.device_code, {
    user_code: d.user_code, verification_uri: d.verification_uri,
    interval: d.interval ?? 5, expires_at: Date.now() + (d.expires_in * 1000), domain,
  });
  return { user_code: d.user_code, verification_uri: d.verification_uri, device_code: d.device_code, interval: d.interval ?? 5, expires_in: d.expires_in };
}

export async function copilotPollDevice(device_code: string): Promise<{ status: "pending" | "complete" | "failed"; error?: string }> {
  const sess = copilotSessions.get(device_code);
  if (!sess) return { status: "failed", error: "unknown device_code" };
  if (Date.now() > sess.expires_at) { copilotSessions.delete(device_code); return { status: "failed", error: "expired" }; }

  const r = await fetch(`https://${sess.domain}/login/oauth/access_token`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GitHubCopilotChat/0.35.0" },
    body: new URLSearchParams({
      client_id: COPILOT_CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  });
  const d = await r.json() as any;
  if (d.access_token) {
    // Have GitHub token. Exchange for Copilot short-lived token now (proves it works, caches meta).
    const enterprise = sess.domain === "github.com" ? undefined : sess.domain;
    await copilotRefresh(d.access_token, enterprise);
    copilotSessions.delete(device_code);
    return { status: "complete" };
  }
  if (d.error === "authorization_pending" || d.error === "slow_down") return { status: "pending" };
  return { status: "failed", error: d.error_description || d.error || "unknown" };
}

async function copilotRefresh(githubToken: string, enterpriseDomain?: string): Promise<{ access_token: string; base_url: string; expires_at: number }> {
  const domain = validateCopilotDomain(enterpriseDomain);
  const r = await fetch(`https://api.${domain}/copilot_internal/v2/token`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${githubToken}`, ...COPILOT_HEADERS },
  });
  if (!r.ok) throw new Error(`copilot token exchange failed: ${r.status}`);
  const d = await r.json() as any;
  const proxyMatch = d.token.match(/proxy-ep=([^;]+)/);
  const apiHost = proxyMatch ? proxyMatch[1].replace(/^proxy\./, "api.") : "api.individual.githubcopilot.com";
  const base_url = `https://${apiHost}`;
  const expires_at = d.expires_at * 1000 - 5 * 60 * 1000;
  saveToken("github_copilot", {
    refresh_token: githubToken,
    access_token: d.token,
    expires_at,
    meta: { base_url, enterprise: enterpriseDomain ?? null },
  });
  return { access_token: d.token, base_url, expires_at };
}

/** Get a fresh Copilot token, refreshing if expired. Throws if not signed in. */
export async function copilotGetAuth(): Promise<{ access_token: string; base_url: string }> {
  const tok = getToken("github_copilot");
  if (!tok?.refresh_token) throw new Error("Not signed in to GitHub Copilot");
  if (tok.access_token && tok.expires_at && Date.now() < tok.expires_at) {
    return { access_token: tok.access_token, base_url: tok.meta?.base_url ?? "https://api.individual.githubcopilot.com" };
  }
  const r = await copilotRefresh(tok.refresh_token, tok.meta?.enterprise ?? undefined);
  return { access_token: r.access_token, base_url: r.base_url };
}

export const COPILOT_HTTP_HEADERS = COPILOT_HEADERS;

/** List models available to the signed-in Copilot user. */
export async function copilotListModels(): Promise<{ id: string; enabled: boolean }[]> {
  const { access_token, base_url } = await copilotGetAuth();
  const r = await fetch(`${base_url}/models`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${access_token}`,
      ...COPILOT_HEADERS,
      "X-GitHub-Api-Version": "2026-06-01",
    },
  });
  if (!r.ok) throw new Error(`copilot /models ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json() as any;
  const items = Array.isArray(d?.data) ? d.data : [];
  const seen = new Set<string>();
  const out: { id: string; enabled: boolean }[] = [];
  for (const it of items) {
    if (typeof it?.id !== "string" || seen.has(it.id)) continue;
    if (it.model_picker_enabled !== true) continue;   // pi filter: only user-selectable models
    seen.add(it.id);
    const disabled = it?.policy?.state === "disabled";
    out.push({ id: it.id, enabled: !disabled });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/** Enable a Copilot model (required for Claude/GPT models the first time). */
export async function copilotEnableModel(modelId: string): Promise<boolean> {
  const { access_token, base_url } = await copilotGetAuth();
  const r = await fetch(`${base_url}/models/${modelId}/policy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
      ...COPILOT_HEADERS,
      "openai-intent": "chat-policy",
      "x-interaction-type": "chat-policy",
    },
    body: JSON.stringify({ state: "enabled" }),
  });
  return r.ok;
}

// ══════════════════════════════════════════════════════════════════════
//  Google Calendar — Authorization Code Flow (Stored in DB)
// ══════════════════════════════════════════════════════════════════════
export async function googleExchangeCode(code: string, redirect_uri: string) {
  const p = q1<{ google_client_id: string; google_client_secret: string }>("SELECT google_client_id, google_client_secret FROM profile WHERE id=1");
  if (!p?.google_client_id || !p?.google_client_secret) throw new Error("Google Client ID/Secret not configured in settings.");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: p.google_client_id,
      client_secret: p.google_client_secret,
      code,
      redirect_uri,
    }),
  });
  if (!r.ok) throw new Error(`google token exchange failed: ${r.status} ${await r.text()}`);
  const d = await r.json() as any;
  saveToken("google", {
    refresh_token: d.refresh_token, // Provided because access_type=offline
    access_token: d.access_token,
    expires_at: Date.now() + d.expires_in * 1000 - 5 * 60 * 1000,
    meta: null,
  });
}

async function refreshGoogle(refresh: string) {
  const p = q1<{ google_client_id: string; google_client_secret: string }>("SELECT google_client_id, google_client_secret FROM profile WHERE id=1");
  if (!p?.google_client_id || !p?.google_client_secret) throw new Error("Google Client ID/Secret missing.");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ 
      grant_type: "refresh_token", 
      client_id: p.google_client_id, 
      client_secret: p.google_client_secret,
      refresh_token: refresh 
    }),
  });
  if (!r.ok) throw new Error(`google refresh failed: ${r.status}`);
  const d = await r.json() as any;
  saveToken("google", {
    access_token: d.access_token,
    expires_at: Date.now() + d.expires_in * 1000 - 5 * 60 * 1000,
  });
  return d.access_token as string;
}

export async function createGoogleTask(title: string, dateIso: string, notes?: string): Promise<string> {
  const token = await googleGetAccessToken();
  
  // Create task due on the given day
  const due = new Date(`${dateIso}T00:00:00.000Z`);

  const r = await fetch("https://tasks.googleapis.com/tasks/v1/lists/@default/tasks", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: title,
      notes: notes || "",
      due: due.toISOString(),
    }),
  });
  if (!r.ok) throw new Error(`Google Tasks create failed: ${r.status} ${await r.text()}`);
  const d = await r.json() as any;
  return d.id;
}

export async function markGoogleTaskDone(taskId: string) {
  const token = await googleGetAccessToken();
  
  const rPatch = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      status: "completed"
    }),
  });
  if (!rPatch.ok) throw new Error(`Google Tasks patch failed: ${rPatch.status} ${await rPatch.text()}`);
}

export async function updateGoogleTask(taskId: string, patch: { title?: string; notes?: string; due?: string | null }) {
  const token = await googleGetAccessToken();
  const body: any = {};
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.notes !== undefined) body.notes = patch.notes;
  if (patch.due !== undefined) body.due = patch.due ? new Date(`${patch.due}T00:00:00.000Z`).toISOString() : null;

  const rPatch = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/@default/tasks/${taskId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!rPatch.ok) throw new Error(`Google Tasks update failed: ${rPatch.status} ${await rPatch.text()}`);
}

export async function googleGetAccessToken(): Promise<string> {
  const t = getToken("google");
  if (!t?.access_token && !t?.refresh_token) throw new Error("Not signed in to Google");
  if (t.access_token && t.expires_at && Date.now() < t.expires_at) return t.access_token;
  if (!t.refresh_token) throw new Error("Google refresh token missing. Please sign in again.");
  return refreshGoogle(t.refresh_token);
}
const ANTHROPIC_CLIENT_ID = decode("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
const ANTHROPIC_AUTHORIZE = "https://claude.ai/oauth/authorize";
const ANTHROPIC_TOKEN     = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_PORT = 53692;
const CALLBACK_PATH = "/callback";
const REDIRECT_URI  = `http://localhost:${CALLBACK_PORT}${CALLBACK_PATH}`;
const SCOPES = "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

function base64url(buf: Buffer) { return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function pkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

type AnthropicFlow = {
  verifier: string; state: string; server: Server | null;
  code: string | null; error: string | null;
  exchanged: boolean;
};
let anthropicFlow: AnthropicFlow | null = null;

export function anthropicStart(): { auth_url: string; redirect_uri: string } {
  if (anthropicFlow?.server) { try { anthropicFlow.server.close(); } catch {} }

  const { verifier, challenge } = pkce();
  // PKCE: `state` (CSRF token, sent through browser) MUST be different from `verifier`
  // (secret, sent only through the back channel to prove we started the flow).
  // Using verifier as state defeats PKCE entirely.
  const state = base64url(randomBytes(32));

  const flow: AnthropicFlow = { verifier, state, server: null, code: null, error: null, exchanged: false };
  anthropicFlow = flow;

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== CALLBACK_PATH) { res.writeHead(404); res.end("not found"); return; }
    const code = url.searchParams.get("code");
    const s    = url.searchParams.get("state");
    const err  = url.searchParams.get("error");
    if (err)   { flow.error = err; res.writeHead(400, {"Content-Type": "text/html"}); res.end(`<h2>Login failed</h2><p>${err}</p>`); return; }
    if (!code || s !== flow.state) { flow.error = "bad callback"; res.writeHead(400, {"Content-Type": "text/html"}); res.end(`<h2>Bad callback</h2>`); return; }
    flow.code = code;
    res.writeHead(200, {"Content-Type": "text/html"}); res.end(`<html><body style="font-family:system-ui;text-align:center;padding-top:20vh;background:#0a0a0b;color:#fafafa"><h2>Signed in ✓</h2><p style="color:#a1a1aa">Return to LifeOS.</p></body></html>`);
  });
  server.on("error", (e) => { flow.error = String(e); });
  server.listen(CALLBACK_PORT, "127.0.0.1");
  flow.server = server;

  const params = new URLSearchParams({
    code: "true",
    client_id: ANTHROPIC_CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return { auth_url: `${ANTHROPIC_AUTHORIZE}?${params.toString()}`, redirect_uri: REDIRECT_URI };
}

/** Poll from frontend. On first sight of a code, exchanges tokens. */
export async function anthropicPoll(): Promise<{ status: "pending" | "complete" | "failed"; error?: string }> {
  const stored = getToken("anthropic");
  if (stored?.access_token) return { status: "complete" };
  if (!anthropicFlow) return { status: "failed", error: "no flow started" };
  if (anthropicFlow.error) return { status: "failed", error: anthropicFlow.error };
  if (!anthropicFlow.code) return { status: "pending" };
  if (anthropicFlow.exchanged) return { status: "complete" };

  anthropicFlow.exchanged = true;
  try {
    await exchangeAnthropicCode(anthropicFlow.code, anthropicFlow.verifier);
    if (anthropicFlow.server) try { anthropicFlow.server.close(); } catch {}
    anthropicFlow = null;
    return { status: "complete" };
  } catch (e: any) {
    return { status: "failed", error: String(e?.message ?? e) };
  }
}

/** Manual paste fallback (remote browser). */
export async function anthropicFinishManual(input: string): Promise<{ status: "complete" | "failed"; error?: string }> {
  if (!anthropicFlow) return { status: "failed", error: "no flow started" };
  let code: string | null = null;
  let state: string | null = null;
  try {
    const u = new URL(input.trim());
    code = u.searchParams.get("code");
    state = u.searchParams.get("state");
  } catch {
    code = input.trim(); state = anthropicFlow.state;
  }
  if (!code) return { status: "failed", error: "no code found" };
  if (state && state !== anthropicFlow.state) return { status: "failed", error: "state mismatch" };
  try {
    await exchangeAnthropicCode(code, anthropicFlow.verifier);
    if (anthropicFlow.server) try { anthropicFlow.server.close(); } catch {}
    anthropicFlow = null;
    return { status: "complete" };
  } catch (e: any) {
    return { status: "failed", error: String(e?.message ?? e) };
  }
}

async function exchangeAnthropicCode(code: string, verifier: string) {
  const r = await fetch(ANTHROPIC_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: ANTHROPIC_CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  if (!r.ok) throw new Error(`anthropic token exchange failed: ${r.status} ${await r.text()}`);
  const d = await r.json() as any;
  saveToken("anthropic", {
    refresh_token: d.refresh_token,
    access_token: d.access_token,
    expires_at: Date.now() + d.expires_in * 1000 - 5 * 60 * 1000,
    meta: null,
  });
}

async function refreshAnthropic(refresh: string) {
  const r = await fetch(ANTHROPIC_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", client_id: ANTHROPIC_CLIENT_ID, refresh_token: refresh }),
  });
  if (!r.ok) throw new Error(`anthropic refresh failed: ${r.status}`);
  const d = await r.json() as any;
  saveToken("anthropic", {
    refresh_token: d.refresh_token,
    access_token: d.access_token,
    expires_at: Date.now() + d.expires_in * 1000 - 5 * 60 * 1000,
  });
  return d.access_token as string;
}

export async function anthropicGetAccessToken(): Promise<string> {
  const t = getToken("anthropic");
  if (!t?.refresh_token) throw new Error("Not signed in to Anthropic");
  if (t.access_token && t.expires_at && Date.now() < t.expires_at) return t.access_token;
  return refreshAnthropic(t.refresh_token);
}
