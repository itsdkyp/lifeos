"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function QuickJournal({ day }: { day: string }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  useEffect(() => { api.journalGet(day).then(j => setText(j.content)).catch(() => {}); }, [day]);

  // Autosave, debounced.
  useEffect(() => {
    if (status === "idle" && text === "") return;
    const id = setTimeout(async () => {
      setStatus("saving");
      try { await api.journalSave(day, text); setStatus("saved"); }
      catch { setStatus("idle"); }
    }, 800);
    return () => clearTimeout(id);
  }, [text, day, status]);

  return (
    <div className="space-y-2">
      <textarea value={text} onChange={e => { setText(e.target.value); setStatus("idle"); }}
        rows={8} placeholder="what happened today?"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none font-mono" />
      <div className="text-[11px] text-muted-foreground text-right h-4">
        {status === "saving" ? "saving…" : status === "saved" ? "synced to Obsidian ✓" : ""}
      </div>
    </div>
  );
}
