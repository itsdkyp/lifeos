import { q, q1 } from "./db.ts";
import { copilotGetAuth, anthropicGetAccessToken, COPILOT_HTTP_HEADERS } from "./oauth.ts";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };

type ProviderFormat = "openai" | "anthropic" | "gemini";

type ProviderMeta = {
  label: string;
  baseUrl: string;
  needsKey: boolean;
  defaultModel: string;
  format: ProviderFormat;
};

// Provider registry — base URLs, default models, whether they need a key.
export const PROVIDERS: Record<string, ProviderMeta> = {
  openai:         { label: "OpenAI",         baseUrl: "https://api.openai.com/v1",             needsKey: true,  defaultModel: "gpt-4o-mini",                     format: "openai"    },
  anthropic:      { label: "Anthropic",      baseUrl: "https://api.anthropic.com/v1",          needsKey: true,  defaultModel: "claude-3-5-sonnet-latest",        format: "anthropic" },
  gemini:         { label: "Google Gemini",  baseUrl: "https://generativelanguage.googleapis.com/v1beta", needsKey: true, defaultModel: "gemini-3.6-flash",     format: "gemini"    },
  groq:           { label: "Groq (free)",    baseUrl: "https://api.groq.com/openai/v1",        needsKey: true,  defaultModel: "llama-3.3-70b-versatile",         format: "openai"    },
  mistral:        { label: "Mistral",        baseUrl: "https://api.mistral.ai/v1",             needsKey: true,  defaultModel: "mistral-small-latest",            format: "openai"    },
  deepseek:       { label: "DeepSeek",       baseUrl: "https://api.deepseek.com",              needsKey: true,  defaultModel: "deepseek-chat",                   format: "openai"    },
  openrouter:     { label: "OpenRouter (any model)", baseUrl: "https://openrouter.ai/api/v1",  needsKey: true,  defaultModel: "anthropic/claude-3.5-sonnet",     format: "openai"    },
  ollama:         { label: "Ollama (local, free)",   baseUrl: "http://127.0.0.1:11434/v1",     needsKey: false, defaultModel: "llama3.2",                        format: "openai"    },
  github_copilot: { label: "GitHub Copilot",         baseUrl: "https://api.individual.githubcopilot.com", needsKey: false, defaultModel: "claude-sonnet-4.5",       format: "openai"    },
  custom:         { label: "Custom OpenAI-compatible",           baseUrl: "",                    needsKey: false, defaultModel: "",                              format: "openai"    },
};

export type Provider = keyof typeof PROVIDERS;

export type LLMConfig = { provider: Provider; api_key: string | null; model: string; base_url: string | null; auth_type?: string; context_days?: number };

export function getConfig(): LLMConfig | null {
  const row = q1<any>("SELECT provider, api_key, model, base_url, auth_type, context_days FROM llm_config WHERE id=1");
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

async function readSSE(r: Response, onChunk: (t: string) => void, extract: (j: any) => string | undefined): Promise<string> {
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
        try {
          const j = JSON.parse(line.slice(6));
          const txt = extract(j);
          if (txt) { full += txt; onChunk(txt); }
        } catch {}
      }
    }
  }
  return full;
}

function applyMask(text: string): string {
  if (!text) return text;
  const p = q1<any>("SELECT name, dob, alias FROM profile WHERE id=1");
  let masked = text;
  
  const alias = p?.alias?.trim() || "Goku";
  
  if (p?.name) {
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const name = p.name;
    const firstName = name.split(" ")[0];
    
    masked = masked.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "gi"), alias);
    if (firstName && firstName.length > 1) {
      masked = masked.replace(new RegExp(`\\b${escapeRegExp(firstName)}\\b`, "gi"), alias);
    }
  }
  
  if (p?.dob) {
    masked = masked.replace(new RegExp(`\\b${p.dob}\\b`, "g"), "[DOB Redacted]");
  }
  
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[Email Redacted]");
  masked = masked.replace(/\b\d{10}\b/g, "[Phone Redacted]");
  
  return masked;
}

// ── low-level provider call ─────────────────────────────────────────────────
export async function callChat(cfg: LLMConfig, messages: ChatMsg[], onChunk?: (t: string) => void): Promise<string> {
  const LLM_TIMEOUT_MS = 60_000; // 60s: streaming can be slow; balances UX vs stuck fetch.
  const LLM_MAX_TOKENS = 2000;
  const maskedMessages = messages.map(m => ({ ...m, content: applyMask(m.content) }));

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
      body: JSON.stringify({ model: cfg.model || "claude-sonnet-4.5", messages: maskedMessages, stream: !!onChunk, max_tokens: LLM_MAX_TOKENS }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`copilot ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (onChunk) return readSSE(r, onChunk, j => j.choices?.[0]?.delta?.content);
    const j = await r.json() as any;
    return j.choices?.[0]?.message?.content ?? "";
  }

  if (cfg.provider === "anthropic" && cfg.auth_type === "oauth") {
    const token = await anthropicGetAccessToken();
    const system = maskedMessages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const convo  = maskedMessages.filter(m => m.role !== "system").map(m => ({ role: m.role, content: m.content }));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
      body: JSON.stringify({ model: cfg.model || "claude-3-5-sonnet-latest", system, messages: convo, max_tokens: LLM_MAX_TOKENS, stream: !!onChunk }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (onChunk) return readSSE(r, onChunk, j => j.type === "content_block_delta" ? j.delta?.text : undefined);
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
      body: JSON.stringify({ model: cfg.model || info.defaultModel, messages: maskedMessages, stream: !!onChunk, max_tokens: LLM_MAX_TOKENS }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`${cfg.provider} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (onChunk) return readSSE(r, onChunk, j => j.choices?.[0]?.delta?.content);
    const j = await r.json() as any;
    return j.choices?.[0]?.message?.content ?? "";
  }

  if (info.format === "anthropic") {
    // Extract system, convert rest.
    const system = maskedMessages.filter(m => m.role === "system").map(m => m.content).join("\n\n");
    const convo  = maskedMessages.filter(m => m.role !== "system")
                           .map(m => ({ role: m.role, content: m.content }));
    const r = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.api_key ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: cfg.model || info.defaultModel, system, messages: convo, max_tokens: LLM_MAX_TOKENS, stream: !!onChunk }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (onChunk) return readSSE(r, onChunk, j => j.type === "content_block_delta" ? j.delta?.text : undefined);
    const j = await r.json() as any;
    return j.content?.[0]?.text ?? "";
  }

  if (info.format === "gemini") {
    const contents = maskedMessages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const systemInstruction = { parts: [{ text: maskedMessages.filter(m => m.role === "system").map(m => m.content).join("\n\n") }] };
    const model = cfg.model || info.defaultModel;
    const r = await fetch(`${base}/models/${model}:${onChunk ? "streamGenerateContent?alt=sse&key=" : "generateContent?key="}${cfg.api_key ?? ""}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents, systemInstruction, generationConfig: { maxOutputTokens: LLM_MAX_TOKENS } }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
    if (onChunk) return readSSE(r, onChunk, j => j.candidates?.[0]?.content?.parts?.[0]?.text);
    const j = await r.json() as any;
    return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  throw new Error(`Unsupported format: ${info.format}`);
}

// Same math as GET /accounts in index.ts. Kept as a small local helper so the LLM
// sees the same current balance the UI shows — not just the (often years-old)
// initial_balance. The transactions list in LLM context is bounded to the last N
// days, so without this the model would try to reconstruct balances from a
// partial history and get them wrong.
function accountsWithBalances() {
  const accounts = q<any>("SELECT id, name, type, currency, initial_balance FROM accounts");
  const txns = q<{ account_id: number | null; to_account_id: number | null; amount: number; kind: string }>(
    "SELECT account_id, to_account_id, amount, kind FROM transactions WHERE account_id IS NOT NULL OR to_account_id IS NOT NULL"
  );
  const bal: Record<number, number> = {};
  for (const t of txns) {
    if (t.kind === "transfer") {
      if (t.account_id)     bal[t.account_id]    = (bal[t.account_id]    ?? 0) - t.amount;
      if (t.to_account_id)  bal[t.to_account_id] = (bal[t.to_account_id] ?? 0) + t.amount;
    } else if (t.account_id) {
      bal[t.account_id] = (bal[t.account_id] ?? 0) + (t.kind === "income" ? t.amount : -t.amount);
    }
  }
  return accounts.map(a => {
    const isLiability = a.type === "credit_card" || a.type === "payable";
    const startBal = isLiability ? -a.initial_balance : a.initial_balance;
    return { ...a, current_balance: startBal + (bal[a.id] || 0) };
  });
}

// ── high-level API used by /chat and /review ────────────────────────────────
export async function askLLM(question: string, onChunk?: (t: string) => void): Promise<string> {
  const cfg = getConfig();
  if (!cfg) throw new Error("LLM is not configured. Go to Settings → LLM to set it up.");
  
  const contextDays = cfg.context_days ?? 30;
  const since = new Date(Date.now() - contextDays * 864e5).toISOString().slice(0, 10);
  
  // Bounded: no unlimited SELECT * scans. Every list is capped so a heavy user
  // can't blow past the model's context window or explode the prompt cost.
  const LIMIT_TXN = 500, LIMIT_MOOD = 300, LIMIT_TIME = 300, LIMIT_MEAL = 300,
        LIMIT_JOURNAL = 60, LIMIT_HABIT_LOG = 500, LIMIT_TASKS = 50, LIMIT_HOLDINGS = 200;
  
  const context = {
    accounts:     accountsWithBalances(),
    holdings:     q(`SELECT symbol, kind, shares, cost_basis, currency, manual_price, note, imported_from
                     FROM holdings ORDER BY symbol LIMIT ${LIMIT_HOLDINGS}`),
    habits:       q("SELECT id, name, cadence, target_per_week FROM habits WHERE archived=0"),
    habit_logs:   q(`SELECT h.name, l.day FROM habit_logs l JOIN habits h ON h.id=l.habit_id
                     WHERE l.day>=? ORDER BY l.day DESC LIMIT ${LIMIT_HABIT_LOG}`, since),
    journals:     q(`SELECT day, substr(content, 1, 2000) as content FROM journals
                     WHERE day>=? ORDER BY day DESC LIMIT ${LIMIT_JOURNAL}`, since),
    transactions: q(`SELECT ts, amount, category, note, kind, account_id, to_account_id 
                     FROM transactions WHERE date(ts,'localtime')>=? 
                     ORDER BY ts DESC LIMIT ${LIMIT_TXN}`, since),
    mood2d:       q(`SELECT ts,energy,valence,tag,note FROM mood2d 
                     WHERE date(ts,'localtime')>=? ORDER BY ts DESC LIMIT ${LIMIT_MOOD}`, since),
    time:         q(`SELECT label,category,started_at,ended_at FROM time_sessions 
                     WHERE date(started_at,'localtime')>=? ORDER BY started_at DESC LIMIT ${LIMIT_TIME}`, since),
    sleep:        q("SELECT day, hours, quality FROM sleep WHERE day>=? ORDER BY day DESC", since),
    weight:       q("SELECT day, kg FROM weight WHERE day>=? ORDER BY day DESC", since),
    meals:        q(`SELECT ts,name,kcal,protein_g,carbs_g,fat_g FROM meals 
                     WHERE date(ts,'localtime')>=? ORDER BY ts DESC LIMIT ${LIMIT_MEAL}`, since),
    tasks_open:   q(`SELECT id, title, priority, due_date FROM tasks 
                     WHERE done=0 ORDER BY due_date ASC LIMIT ${LIMIT_TASKS}`),
    active_timer: q1("SELECT label, category, started_at FROM time_sessions WHERE ended_at IS NULL ORDER BY started_at DESC"),
  };
  
  // Hard cap on serialized JSON size (~90k chars ≈ 22.5k tokens). 
  // If the user's history is huge, drop the oldest half of the heaviest arrays until we fit.
  let payload = JSON.stringify(context);
  const MAX_CHARS = 90_000;
  if (payload.length > MAX_CHARS) {
    const heavy = ["transactions", "mood2d", "time", "meals", "habit_logs", "journals", "holdings"] as const;
    let iterations = 0;
    while (payload.length > MAX_CHARS && iterations < 5) {
      for (const key of heavy) {
        const arr = (context as any)[key] as any[];
        if (Array.isArray(arr) && arr.length > 10) (context as any)[key] = arr.slice(0, Math.floor(arr.length / 2));
      }
      payload = JSON.stringify(context);
      iterations++;
    }
  }
  
  const messages: ChatMsg[] = [
    { role: "system", content:
      `You are LifeOS, a personal analytics assistant and agentic intent handler. You have context of the user's life spanning ` +
      `finances, accounts, debts, investments (holdings), habits, open tasks, active timers, mood, sleep, and meals for up to the last ${contextDays} days ` +
      `(older or overflowing records may be truncated). Answer questions helpfully and concisely. Cite concrete dates and numbers. Never fabricate data.\n\n` +
      `IMPORTANT for accounts & money:\n` +
      `- Each account has a current_balance field — use THAT for "what's my balance?" questions. It already reflects all transactions ever, not just the ${contextDays} days shown.\n` +
      `- Account types: 'bank' and 'cash' = your money (positive = you have it). 'credit_card' = card debt (positive balance shown = you owe that much). ` +
      `'receivable' = someone owes YOU money (positive = they owe you). 'payable' = you owe someone else (positive = you owe them).\n` +
      `- Transactions have kind='expense'|'income'|'transfer'. Transfers move money between accounts (account_id → to_account_id) and do NOT count as spending. IOUs (lending/borrowing) are recorded as transfers between a bank account and a receivable/payable account.\n` +
      `- Only the last ${contextDays} days of transactions are in context. For older history, quote the current_balance and say "per your current balance" rather than trying to sum a partial list.\n\n` +
      `IMPORTANT for investments: the holdings list gives you symbol, shares, cost_basis (per unit), and currency — quote invested amounts as shares*cost_basis. ` +
      `Live market prices are NOT included in this context; if asked for current market value, say the live value is available on the Investments page and give the cost basis figure instead of guessing.\n\n` + profileBlock() },
    { role: "user", content: `DATA:\n${payload}\n\nQUESTION: ${question}` },
  ];
  return callChat(cfg, messages, onChunk);
}
