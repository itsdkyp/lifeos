"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { QuickJournal } from "@/components/quick-journal";
import { Trash2, Plus, Sparkles, Heart } from "lucide-react";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [day, setDay] = useState<string>(todayStr());

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground">Reflection is where tracking becomes change.</p>
        </div>
        <input type="date" value={day} onChange={e => setDay(e.target.value)}
          max={todayStr()}
          className="rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
      </header>

      <Card title={`Entry · ${day}`}>
        <QuickJournal day={day} />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <LineList day={day} kind="wins" title="Wins" icon={<Sparkles className="h-4 w-4 text-amber-500" />} placeholder="one thing that went well…" />
        <LineList day={day} kind="grat" title="Gratitude" icon={<Heart className="h-4 w-4 text-pink-500" />} placeholder="one thing you're grateful for…" />
      </div>
    </div>
  );
}

function LineList({ day, kind, title, icon, placeholder }: {
  day: string; kind: "wins" | "grat"; title: string; icon: React.ReactNode; placeholder: string;
}) {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  const [text, setText] = useState("");

  const load = () => (kind === "wins" ? api.winsGet(day) : api.gratitudesGet(day))
    .then(setItems).catch(() => {});
  useEffect(() => { load(); }, [day, kind]);

  async function add() {
    if (!text.trim()) return;
    if (kind === "wins") await api.winAdd(day, text);
    else                 await api.gratitudeAdd(day, text);
    setText(""); load();
  }
  async function del(id: number) {
    if (kind === "wins") await api.winDelete(id);
    else                 await api.gratitudeDelete(id);
    load();
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="space-y-1 mb-3 min-h-[100px]">
        {items.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">{placeholder}</div>}
        {items.map(x => (
          <div key={x.id} className="group flex items-start gap-2 py-1 text-sm">
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="flex-1">{x.text}</span>
            <button onClick={() => del(x.id)} className="opacity-50 hover:opacity-100 md:opacity-30 md:group-hover:opacity-100 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder={placeholder}
          className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <button onClick={add} className="rounded-md bg-primary text-primary-foreground px-3 hover:opacity-90">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}
