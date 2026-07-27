import { q, q1 } from "./db.ts";
import { copilotGetAuth, anthropicGetAccessToken, COPILOT_HTTP_HEADERS } from "./oauth.ts";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

// Provider registry — base URLs, default models, whether they need a key.
export const PROVIDERS = {
  openai:         { label: "OpenAI",         baseUrl: "https://api.openai.com/v1",             needsKey: true,  defaultModel: "gpt-4o-mini",                     format: "openai"    as const },
  anthropic:      { label: "Anthropic",      baseUrl: "https://api.anthropic.com/v1",          needsKey: true,  defaultModel: "claude-3-5-sonnet-latest",        format: "anthropic" as const },
  gemini:         { label: "Google Gemini",  baseUrl: "https://generativelanguage.googleapis.com/v1beta", needsKey: true, defaultModel: "gemini-2.0-flash",     format: "gemini"    as const },
  groq:           { label: "Groq (free)",    baseUrl: "https://api.groq.com/openai/v1",        needsKey: true,  defaultModel: "llama-3.3-70b-versatile",         format: "openai"    as const },
  mistral:        { label: "Mistral",        baseUrl: "https://api.mistral.ai/v1",             needsKey: true,  defaultModel: "mistral-small-latest",            format: "openai"    as const },
  deepseek:       { label: "DeepSeek",       baseUrl: "https://api.deepseek.com",              needsKey: true,  defaultModel: "deepseek-chat",                   format: "openai"    as const },
  openrouter:     { label: "OpenRouter (any model)", baseUrl: "https://openrouter.ai/api/v1",  needsKey: true,  defaultModel: "anthropic/claude-3.5-sonnet",     format: "openai"    as const },
  ollama:         { label: "Ollama (local, free)",   baseUrl: "http://127.0.0.1:11434/v1",     needsKey: false, defaultModel: "llama3.2",                        format: "openai"    as const },
  github_copilot: { label: "GitHub Copilot",         baseUrl: "https://api.individual.githubcopilot.com", needsKey: false, defaultModel: "claude-sonnet-4.5",       format: "openai"    as const },
  custom:         { label: "Custom OpenAI-compatible",           baseUrl: "",                    needsKey: false, defaultModel: "",                              format: "openai"    as const },
} as const;

export type Provider = keyof typeof PROVIDERS;

export type LLMConfig = { provider: Provider; api_key: string | null; model: string; base_url: string | null; auth_type?: string };

export function getConfig(): LLMConfig | null {
  const row = q1<any>("SELECT provider, api_key, model, base_url, auth_type FROM llm_config WHERE id=1");
  return row ?? null;
}

function profileBlock(): string {
  const p = q1<any>("SELECT * FROM profile WHERE id=1");
  if (!p) return "";
  const age = p.dob ? Math.floor((Date.now() - new Date(p.dob).getTime()) / (365.25 * 864e5)) : null;
  return `USER PROFILE:
- Name: ${p.name}${age != null ? ` (age ${age})` : ""}${p.pronouns ? `, ${p.pronouns}` : ""}
- Timezone: ${p.timezone ?? "unknown"}
- Currency: ${p.currency ?? "USD"}
- Sleep target: ${p.sleep_target_hours ?? 8}h
- Values: ${p.values_json ?? "(not set)"}
- Current focus: ${p.goal ?? "(not set)"}
Always address the user by first name.`;
}

// ── low-level provider call ─────────────────────────────────────────────────
export async function callChat(cfg: LLMConfig, messages: ChatMsg[]): Promise<string> {
  // OAuth branches — provider identifies subscription, tokens live in oauth_tokens.
  if (cfg.provider === "github_copilot" && cfg.auth_type === "oauth") {
    const { access_token, base_url } = await copilotGetAuth();
    const r = await fetch(`${base_url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
        ...COPILOT_HTTP_HEADERS,
        "openai-intent": "conversation-panel",
      },
      body: JSON.stringify({ model: cfg.model || "claude-sonnet-4.5", messages }),
    });
    if (!r.ok) throw new Error(`copilot ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as any;
    return j.choices?.[0]?.message?.content ?? "";
  }

  if (cfg.provider === "anthropic" && cfg.auth_type === "oauth") {
    const token = await anthropicGetAccessToken();
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const convo  = messages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
      body: JSON.stringify({ model: cfg.model || "claude-3-5-sonnet-latest", system, messages: convo, max_tokens: 1024 }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as any;
    return j.content?.[0]?.text ?? "";
  }

  const info = PROVIDERS[cfg.provider];
  const base = cfg.base_url || info.baseUrl;
  if (!base) throw new Error("No base URL configured.");

  if (info.format === "openai") {
    const r = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.api_key ? { Authorization: `Bearer ${cfg.api_key}` } : {}),
      },
      body: JSON.stringify({ model: cfg.model || info.defaultModel, messages }),
    });
    if (!r.ok) throw new Error(`${cfg.provider} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as any;
    return j.choices?.[0]?.message?.content ?? "";
  }

  if (info.format === "anthropic") {
    // Extract system, convert rest.
    const system = messages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const convo  = messages.filter(m => m.role !== "system")
                           .map(m => ({ role: m.role, content: m.content }));
    const r = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.api_key ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: cfg.model || info.defaultModel, system, messages: convo, max_tokens: 1024 }),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as any;
    return j.content?.[0]?.text ?? "";
  }

  if (info.format === "gemini") {
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const systemInstruction = { parts: [{ text: messages.filter(m => m.role === "system").map(m => m.content).join("\n\n") }] };
    const model = cfg.model || info.defaultModel;
    const r = await fetch(`${base}/models/${model}:generateContent?key=${cfg.api_key ?? ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction }),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json() as any;
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  throw new Error(`Unsupported format: ${info.format}`);
}

// ── high-level API used by /chat and /review ────────────────────────────────
export async function askLLM(question: string): Promise<string> {
  const cfg = getConfig();
  if (!cfg) throw new Error("LLM is not configured. Go to Settings → LLM to set it up.");
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const context = {
    journals:     q("SELECT day, content FROM journals WHERE day>=? ORDER BY day DESC", since),
    transactions: q("SELECT ts,amount,category,note,kind FROM transactions WHERE date(ts,'localtime')>=? ORDER BY ts DESC", since),
    moods:        q("SELECT ts,score,note FROM moods WHERE date(ts,'localtime')>=? ORDER BY ts DESC", since),
    mood2d:       q("SELECT ts,energy,valence,tag,note FROM mood2d WHERE date(ts,'localtime')>=? ORDER BY ts DESC", since),
    time:         q("SELECT label,category,started_at,ended_at FROM time_sessions WHERE date(started_at,'localtime')>=? ORDER BY started_at DESC", since),
    sleep:        q("SELECT * FROM sleep WHERE day>=? ORDER BY day DESC", since),
    weight:       q("SELECT * FROM weight WHERE day>=? ORDER BY day DESC", since),
    meals:        q("SELECT ts,name,kcal,protein_g,carbs_g,fat_g FROM meals WHERE date(ts,'localtime')>=? ORDER BY ts DESC", since),
    tasks_open:   q("SELECT title, priority, due_date FROM tasks WHERE done=0"),
  };
  const messages: ChatMsg[] = [
    { role: "system", content:
      "You are LifeOS, a personal analytics assistant. You have the user's last 14 days of " +
      "journal, finance, mood, time, sleep, weight, and meal data. Answer briefly. Cite " +
      "concrete dates and numbers. Never fabricate.\n\n" + profileBlock() },
    { role: "user", content: `DATA:\n${JSON.stringify(context)}\n\nQUESTION: ${question}` },
  ];
  return callChat(cfg, messages);
}
