"use client";
import { useEffect, useState } from "react";
import { api, type Task } from "@/lib/api";
import { ChevronLeft, ChevronRight, Flame, Star, CheckCircle2 } from "lucide-react";
import { cn, todayLocal } from "@/lib/utils";

export function TaskCalendar() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [googleEvents, setGoogleEvents] = useState<{ id: string; title: string; date: string; type: "event" | "task"; done?: boolean }[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());

  const refresh = () => {
    api.tasks("all").then(setTasks).catch(() => {});
    api.googleCalendar().then(setGoogleEvents).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const today = () => setCurrentDate(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const blanks = Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`blank-${i}`} className="p-2 border border-border/50 bg-secondary/10 opacity-50 min-h-[100px]" />);
  
  const days = Array.from({ length: daysInMonth }).map((_, i) => {
    const d = i + 1;
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dayTasks = tasks.filter(t => t.due_date === dateStr);
    const dayEvents = googleEvents.filter(e => e.date === dateStr);
    
    const isToday = todayLocal() === dateStr;

    return (
      <div key={d} className={cn("p-2 border border-border/50 min-h-[100px] flex flex-col gap-1 overflow-y-auto", isToday ? "bg-primary/5 border-primary/20" : "")}>
        <div className={cn("text-xs font-medium mb-1", isToday ? "text-primary" : "text-muted-foreground")}>{d}</div>
        {dayEvents.map(e => (
          <div key={e.id} className={cn("text-[10px] truncate px-1.5 py-1 rounded",
            e.type === "task" 
              ? (e.done ? "bg-secondary/50 border border-transparent text-muted-foreground line-through opacity-70" : "bg-purple-500/10 border border-purple-500/20 text-purple-500")
              : "bg-blue-500/10 border border-blue-500/20 text-blue-500"
          )}>
            {e.type === "task" && e.done ? <CheckCircle2 className="inline h-2.5 w-2.5 mr-1" /> : null}
            {e.type === "event" ? "📅 " : (e.done ? "" : "📋 ")}{e.title}
          </div>
        ))}
        {dayTasks.map(t => (
          <div key={t.id} className={cn("text-[10px] truncate px-1.5 py-1 rounded border",
            t.done ? "opacity-50 line-through bg-secondary/50 border-transparent text-muted-foreground" :
            t.is_urgent && t.is_important ? "bg-red-500/10 border-red-500/20 text-red-500" :
            t.is_important ? "bg-blue-500/10 border-blue-500/20 text-blue-500" :
            t.is_urgent ? "bg-orange-500/10 border-orange-500/20 text-orange-500" :
            "bg-secondary/50 border-border text-foreground"
          )}>
            {t.done ? <CheckCircle2 className="inline h-2.5 w-2.5 mr-1" /> : null}
            {t.is_important && !t.done ? <Star className="inline h-2.5 w-2.5 mr-0.5 fill-current" /> : null}
            {t.is_urgent && !t.done ? <Flame className="inline h-2.5 w-2.5 mr-0.5 fill-current" /> : null}
            {t.title}
          </div>
        ))}
      </div>
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
        <div className="flex items-center gap-2">
          <button onClick={today} className="text-xs px-2 py-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground">Today</button>
          <button onClick={prevMonth} className="p-1 rounded hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-secondary"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-center text-[10px] uppercase font-semibold text-muted-foreground py-2 border-b border-border/50">{d}</div>
        ))}
        {blanks}
        {days}
      </div>
    </div>
  );
}
