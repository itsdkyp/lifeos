"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/card";
import { QuickJournal } from "@/components/quick-journal";
import { Trash2, Plus, Sparkles, Heart, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export default function Page() {
  const [day, setDay] = useState<string>(todayStr());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [calendarData, setCalendarData] = useState<{ day: string; preview: string }[]>([]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    api.calendar(monthStr).then(setCalendarData).catch(() => {});
  }, [monthStr, day]); // Reload calendar when day changes (in case they write something today)

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const blanks = Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`blank-${i}`} className="p-2 opacity-0" />);
  
  const days = Array.from({ length: daysInMonth }).map((_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const hasEntry = calendarData.some(c => c.day === dateStr && c.preview.trim().length > 0);
    const isSelected = dateStr === day;
    const isToday = dateStr === todayStr();
    const isFuture = dateStr > todayStr();

    return (
      <button 
        key={d} 
        disabled={isFuture}
        onClick={() => setDay(dateStr)}
        className={cn(
          "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-all relative",
          isFuture ? "opacity-30 cursor-not-allowed" : "hover:bg-secondary cursor-pointer",
          isSelected ? "bg-primary text-primary-foreground hover:bg-primary" : "",
          isToday && !isSelected ? "text-primary font-bold" : "",
          !isSelected && !isToday ? "text-muted-foreground" : ""
        )}
      >
        {d}
        {hasEntry && !isSelected && (
          <span className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500" />
        )}
        {hasEntry && isSelected && (
          <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary-foreground opacity-70" />
        )}
      </button>
    );
  });

  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const goToToday = () => {
    setDay(todayStr());
    setCurrentMonth(new Date());
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground">Reflection is where tracking becomes change.</p>
        </div>
        <button onClick={goToToday} className="text-xs px-3 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-foreground transition">
          Go to Today
        </button>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_2.5fr]">
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold">{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
              <div className="flex items-center gap-1">
                <button onClick={prevMonth} className="p-1 rounded-md hover:bg-secondary"><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
                <button onClick={nextMonth} className="p-1 rounded-md hover:bg-secondary"><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-2 place-items-center">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={`${d}-${i}`} className="text-center text-[10px] uppercase font-semibold text-muted-foreground py-1 w-full">{d}</div>
              ))}
              {blanks}
              {days}
            </div>
          </Card>
          
          <div className="px-2">
             <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this day</div>
             <p suppressHydrationWarning className="text-lg font-medium">
               {mounted ? new Date(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : ""}
             </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-6 sm:p-8 min-h-[500px] flex flex-col shadow-sm">
            <div className="flex-1 flex flex-col">
              <QuickJournal day={day} />
            </div>
            
            <div className="grid gap-6 md:grid-cols-2 mt-8 pt-8 border-t border-border/50">
              <LineList day={day} kind="wins" title="Wins" icon={<Sparkles className="h-4 w-4 text-amber-500" />} placeholder="One thing that went well…" />
              <LineList day={day} kind="grat" title="Gratitude" icon={<Heart className="h-4 w-4 text-pink-500" />} placeholder="One thing you're grateful for…" />
            </div>
          </div>
        </div>
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
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      </div>
      <div className="space-y-1">
        {items.length === 0 && <div className="text-xs text-muted-foreground italic py-2">{placeholder}</div>}
        {items.map(x => (
          <div key={x.id} className="group flex items-start gap-2 py-1 text-sm">
            <span className="text-muted-foreground shrink-0 mt-0.5">•</span>
            <span className="flex-1 text-foreground/90 leading-snug">{x.text}</span>
            <button onClick={() => del(x.id)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive shrink-0 mt-0.5 p-0.5">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2">
        <input value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder={`Add ${title.toLowerCase()}...`}
          className="flex-1 bg-transparent border-b border-border/50 px-1 py-1.5 text-sm outline-none focus:border-primary transition-colors placeholder:text-muted-foreground/50" />
        <button onClick={add} className="text-muted-foreground hover:text-primary transition p-1">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
