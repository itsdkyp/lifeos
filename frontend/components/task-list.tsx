"use client";
import { useEffect, useState } from "react";
import { api, type Task } from "@/lib/api";
import { Plus, Trash2, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

export function TaskList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<1 | 2 | 3>(2);

  const refresh = () => api.tasks(filter).then(setTasks).catch(() => {});
  useEffect(() => { refresh(); }, [filter]);

  async function add() {
    if (!title.trim()) return;
    await api.taskAdd({ title, priority, due_date: due || undefined });
    setTitle(""); setDue(""); setPriority(2);
    refresh();
  }
  async function toggle(t: Task) { await api.taskPatch(t.id, { done: !t.done }); refresh(); }
  async function del(t: Task)    { await api.taskDelete(t.id); refresh(); }

  const shown = limit ? tasks.slice(0, limit) : tasks;
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex gap-2 text-xs">
          {(["open", "done", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full ${filter === f ? "bg-primary text-primary-foreground" : "bg-secondary/50 hover:bg-secondary"}`}>
              {f}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-1">
        {shown.map(t => {
          const overdue = t.due_date && t.due_date < todayStr && !t.done;
          return (
            <div key={t.id} className="group flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)}
                className="h-4 w-4 accent-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm truncate", t.done && "line-through text-muted-foreground")}>
                  {t.priority === 3 && <Flame className="inline h-3 w-3 mr-1 text-red-500" />}
                  {t.title}
                </div>
                {t.due_date && (
                  <div className={cn("text-[11px]", overdue ? "text-red-500" : "text-muted-foreground")}>
                    due {t.due_date}
                  </div>
                )}
              </div>
              <button onClick={() => del(t)} className="opacity-50 hover:opacity-100 md:opacity-30 md:group-hover:opacity-100 transition text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {shown.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">No tasks.</div>
        )}
      </div>

      <div className="pt-2 border-t border-border space-y-2">
        <input value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="add a task…"
          className="w-full rounded-md bg-secondary/50 border border-border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
        <div className="flex gap-2">
          <input type="date" value={due} onChange={e => setDue(e.target.value)}
            className="flex-1 rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-xs outline-none" />
          <select value={priority} onChange={e => setPriority(+e.target.value as 1 | 2 | 3)}
            className="rounded-md bg-secondary/50 border border-border px-2 py-1.5 text-xs outline-none">
            <option value={1}>low</option>
            <option value={2}>med</option>
            <option value={3}>high</option>
          </select>
          <button onClick={add}
            className="rounded-md bg-primary text-primary-foreground px-3 hover:opacity-90">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
