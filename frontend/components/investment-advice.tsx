"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { Sparkles, RefreshCw, Send } from "lucide-react";
import { AllocationGauge } from "./allocation-gauge";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Msg = { role: "user" | "assistant"; content: string };

export function InvestmentAdvice() {
  const [initial, setInitial] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, loading]);

  async function generateInitial(force = false) {
    setLoading(true); setError("");
    try {
      const r = await api.holdingsAdvice(force);
      if (r.error) setError(r.error);
      else setInitial(r.advice ?? "");
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setLoading(false); }
  }

  async function send() {
    const text = input.trim(); if (!text || loading) return;
    setInput(""); setLoading(true); setError("");
    const nextMsgs: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(nextMsgs);
    try {
      const r = await api.holdingsAdvisor(nextMsgs);
      if (r.error) setError(r.error);
      else setMsgs([...nextMsgs, { role: "assistant", content: r.answer ?? "" }]);
    } catch (e: any) { setError(String(e.message ?? e)); }
    finally { setLoading(false); }
  }

  const starters = [
    "Am I overexposed to small-cap?",
    "How should I rebalance?",
    "Suggest monthly SIP amounts",
    "Am I saving enough tax?",
    "How much emergency fund do I need?",
  ];

  return (
    <div className="space-y-4">
      {/* Deterministic visual gauge — always visible when there are holdings */}
      <AllocationGauge />

      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Financial advisor · Indian expert</span>
          </div>
          {initial && (
            <button onClick={() => generateInitial(true)} disabled={loading}
              className="rounded-md bg-secondary/50 hover:bg-secondary px-3 py-1.5 text-xs flex items-center gap-1">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Fresh analysis
            </button>
          )}
        </div>

        {!initial && !error && (
          <div className="text-center py-6 space-y-3">
            <div className="text-sm text-muted-foreground">Get a warm, specific review to complement the gauge above.</div>
            <button onClick={() => generateInitial(false)} disabled={loading}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2 mx-auto">
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {loading ? "Analyzing…" : "Analyze my portfolio"}
            </button>
            <div className="text-[10px] text-muted-foreground">Uses your configured LLM. Cached 6h; regenerate any time.</div>
          </div>
        )}

        {error && (
          <div className="text-xs text-destructive whitespace-pre-wrap">
            {error}
            {error.includes("not configured") && <div className="text-muted-foreground mt-1">Go to Settings → LLM to connect one.</div>}
          </div>
        )}

        {initial && (
          <>
            <div ref={scrollRef} className="max-h-[520px] overflow-y-auto space-y-4 pr-2">
              <Md text={initial} />
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm text-left ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                  }`}>
                    {m.role === "assistant" ? <Md text={m.content} /> : <span className="whitespace-pre-wrap">{m.content}</span>}
                  </div>
                </div>
              ))}
              {loading && msgs.length > 0 && <div className="text-xs text-muted-foreground">thinking…</div>}
            </div>

            {msgs.length === 0 && !loading && (
              <div className="mt-4 flex flex-wrap gap-2">
                {starters.map(s => (
                  <button key={s} onClick={() => setInput(s)}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-secondary/40 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border">
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="Ask a follow-up: rebalance, SIPs, tax, etc."
                className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                disabled={loading} />
              <button onClick={send} disabled={loading || !input.trim()}
                className="rounded-md bg-primary text-primary-foreground px-3 hover:opacity-90 disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/** Render markdown with themed styles for headings, lists, tables. */
function Md({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-foreground
                    [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-1
                    [&_p]:my-1
                    [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc
                    [&_ol]:my-1 [&_ol]:pl-5 [&_ol]:list-decimal
                    [&_li]:my-0.5
                    [&_strong]:text-foreground [&_strong]:font-semibold
                    [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
