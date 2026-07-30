"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function QuickJournal({ day }: { day: string }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"loading" | "load-failed" | "idle" | "saving" | "saved">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api.journalGet(day).then(j => {
      if (cancelled) return;
      setText(j.content ?? "");
      setStatus("idle");
    }).catch(() => {
      if (cancelled) return;
      // CRITICAL: do NOT reset text to "". Enter load-failed state
      // to block autosave from overwriting the server copy with empty.
      setStatus("load-failed");
    });
    return () => { cancelled = true; };
  }, [day]);

  // Autosave, debounced. Blocked until initial load succeeds.
  useEffect(() => {
    if (status === "loading" || status === "load-failed") return;
    if (status === "idle" && text === "") return;
    const id = setTimeout(async () => {
      setStatus("saving");
      try { await api.journalSave(day, text); setStatus("saved"); }
      catch { setStatus("idle"); }
    }, 800);
    return () => clearTimeout(id);
  }, [text, day, status]);

  const disabled = status === "loading" || status === "load-failed";

  return (
    <div className="flex-1">
      <textarea value={text}
        disabled={disabled}
        onChange={e => { setText(e.target.value); setStatus("idle"); }}
        placeholder={status === "loading" ? "Loading…" : status === "load-failed" ? "Could not load journal. Refresh to retry (typing is disabled to protect your data)." : "What's on your mind today?"}
        className="w-full h-full min-h-[300px] bg-transparent border-0 px-0 py-2 text-base outline-none resize-none font-sans leading-relaxed placeholder:text-muted-foreground/30 focus:ring-0 disabled:opacity-70" />
      <div className="text-[10px] text-right h-4 uppercase tracking-widest mt-2">
        {status === "loading"     && <span className="text-muted-foreground">loading…</span>}
        {status === "load-failed" && <span className="text-destructive">load failed · edits disabled</span>}
        {status === "saving"      && <span className="text-muted-foreground">saving…</span>}
        {status === "saved"       && <span className="text-muted-foreground">synced to Obsidian ✓</span>}
      </div>
    </div>
  );
}
