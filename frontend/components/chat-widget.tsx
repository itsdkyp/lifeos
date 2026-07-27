"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { X, Send, MessageSquare } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); }, [open]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);

  async function send() {
    const text = q.trim(); if (!text || busy) return;
    setQ(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", content: text }]);
    try {
      const { answer } = await api.chat(text);
      setMsgs(m => [...m, { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMsgs(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        aria-label="Ask LifeOS"
        className="rounded-md border border-border bg-card/60 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-card flex items-center gap-1.5 transition">
        <MessageSquare className="h-3.5 w-3.5" /> Ask
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
             onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()}
               className="w-full sm:max-w-lg h-[80vh] sm:h-[70vh] sm:rounded-2xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">Ask LifeOS</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {msgs.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">
                  <p className="mb-2">Ask questions or log things.</p>
                  <div className="font-mono text-[11px] space-y-0.5 opacity-70">
                    <div>"how did I spend last week?"</div>
                    <div>"summarize my mood"</div>
                    <div>"I need to call mom tomorrow"</div>
                    <div>"I worked on Vitex for 30 minutes"</div>
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60"
                  }`}>{m.content}</div>
                </div>
              ))}
              {busy && <div className="text-xs text-muted-foreground">thinking…</div>}
            </div>

            <div className="border-t border-border p-3 flex gap-2">
              <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
                onKeyDown={e => e.key === "Enter" && send()}
                placeholder="ask or log…"
                className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <button onClick={send} disabled={busy}
                className="rounded-md bg-primary text-primary-foreground px-3 hover:opacity-90 disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
