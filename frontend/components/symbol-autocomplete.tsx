"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Suggestion = { symbol: string; name: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; currency: string; source: "preset"|"yahoo"|"amfi"; exchange?: string; nav?: number };
type Pick = { symbol: string; kind: "stock"|"etf"|"crypto"|"mf"|"debt"; currency: string };

export function SymbolAutocomplete({
  value, onChange, onPick, className,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (p: Pick) => void;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // debounce
  useEffect(() => {
    if (value.trim().length < 1) { setSuggestions([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try { setSuggestions(await api.holdingsSearch(value.trim())); }
      catch { setSuggestions([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [value]);

  // click-outside closes
  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, []);

  function pick(s: Suggestion) {
    onChange(s.symbol);
    onPick?.({ symbol: s.symbol, kind: s.kind, currency: s.currency });
    setOpen(false);
    setSuggestions([]);
  }

  function key(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(suggestions[active]!); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <input value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={key}
        placeholder="AAPL · RELIANCE.NS · EPF · Motilal Oswal Midcap …"
        className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />

      {open && (suggestions.length > 0 || loading) && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 rounded-md border border-border bg-card shadow-lg overflow-hidden max-h-72 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">searching…</div>
          )}
          {suggestions.map((s, i) => (
            <button key={`${s.source}:${s.symbol}:${i}`} onClick={() => pick(s)} onMouseEnter={() => setActive(i)}
              className={cn(
                "w-full text-left px-3 py-2 flex items-center justify-between gap-3 border-b border-border/50 last:border-0",
                active === i ? "bg-secondary" : "hover:bg-secondary/60"
              )}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate flex items-center gap-2">
                  {s.symbol}
                  <SourceBadge source={s.source} kind={s.kind} />
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {s.name}{s.exchange ? ` · ${s.exchange}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">
                {s.currency}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source, kind }: { source: string; kind: string }) {
  const cls =
    source === "preset" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" :
    source === "yahoo"  ? "bg-blue-500/15 text-blue-400 border-blue-500/30"      :
    source === "amfi"   ? "bg-pink-500/15 text-pink-400 border-pink-500/30"      : "";
  const label = source === "preset" ? "India fixed" : source === "yahoo" ? "Yahoo" : "AMFI MF";
  return (
    <>
      <span className={cn("text-[9px] uppercase px-1 rounded border", cls)}>{label}</span>
      <span className="text-[9px] uppercase text-muted-foreground border border-border rounded px-1">{kind}</span>
    </>
  );
}
