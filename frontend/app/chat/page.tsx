"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Send } from "lucide-react";
import { Card } from "@/components/card";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!q.trim() || busy) return;
    const question = q; setQ(""); setBusy(true);
    setMsgs(m => [...m, { role: "user", content: question }]);
    try {
      const { answer } = await api.chat(question);
      setMsgs(m => [...m, { role: "assistant", content: answer }]);
    } catch (e: any) {
      setMsgs(m => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Ask LifeOS</h1>
        <p className="text-sm text-muted-foreground">Questions over your last 14 days of data.</p>
      </header>

      <Card>
        <div className="space-y-4 min-h-[300px]">
          {msgs.length === 0 && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Try: "how did I spend last week?" · "summarize my mood" · "where did my time go?"
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div className={`inline-block max-w-[85%] px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-secondary/60"
              }`}>{m.content}</div>
            </div>
          ))}
          {busy && <div className="text-xs text-muted-foreground">thinking…</div>}
        </div>
      </Card>

      <div className="flex gap-2">
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="ask anything about your life…"
          className="flex-1 rounded-md bg-secondary/50 border border-border px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={send} disabled={busy}
          className="rounded-md bg-primary text-primary-foreground px-4 hover:opacity-90 disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
