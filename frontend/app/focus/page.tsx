"use client";
import { useEffect, useState } from "react";
import { api, type Task, type Session } from "@/lib/api";
import { Pomodoro } from "@/components/pomodoro";
import { QuickTimer } from "@/components/quick-timer";

export default function Page() {
  const [active, setActive] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const refresh = () => {
    api.timeActive().then(setActive).catch(() => {});
    api.tasks("open").then(t => setTasks(t.slice(0, 3))).catch(() => {});
  };
  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, []);

  return (
    <div className="mx-auto max-w-2xl min-h-[80vh] flex flex-col items-center justify-center gap-8">
      <div className="w-full max-w-md">
        <div className="text-xs uppercase tracking-widest text-muted-foreground text-center mb-4">Focus</div>
        <div className="rounded-3xl border border-border bg-card/60 backdrop-blur p-8">
          <Pomodoro />
        </div>
      </div>

      <div className="w-full max-w-md rounded-2xl border border-border bg-card/60 backdrop-blur p-6">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Timer</div>
        <QuickTimer active={active} onDone={refresh} />
      </div>

      <div className="w-full max-w-md">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Top of your list</div>
        <ul className="space-y-1">
          {tasks.map(t => (
            <li key={t.id} className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="h-1 w-1 rounded-full bg-muted-foreground" /> {t.title}
            </li>
          ))}
          {tasks.length === 0 && <li className="text-sm text-muted-foreground">No open tasks. Enjoy.</li>}
        </ul>
      </div>
    </div>
  );
}
