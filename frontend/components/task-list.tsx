"use client";
import { useEffect, useState } from "react";
import { api, type Task } from "@/lib/api";
import { Plus, Trash2, Flame, Star, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, RefreshCw, Calendar, Clock, Timer } from "lucide-react";
import { cn, todayLocal } from "@/lib/utils";

export function TaskList({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [time, setTime] = useState("");
  const [isImportant, setIsImportant] = useState(false);
  const [isUrgent, setIsUrgent] = useState(false);
  const [duration, setDuration] = useState<string>("15");
  const [syncing, setSyncing] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const refresh = () => api.tasks(filter).then(setTasks).catch(() => {});
  useEffect(() => { refresh(); }, [filter]);

  async function syncGoogle() {
    setSyncing(true);
    try {
      await api.taskSync();
      await refresh();
    } catch (e: any) {
      if (e.message.includes("Not signed in")) {
        alert("Not connected to Google. Go to Settings > Integrations to connect.");
      } else {
        alert("Sync failed: " + e.message);
      }
    } finally {
      setSyncing(false);
    }
  }

  async function add() {
    if (!title.trim()) return;
    const dur = parseInt(duration) || 15;
    await api.taskAdd({ title, is_important: isImportant, is_urgent: isUrgent, due_date: due || undefined, due_time: time || undefined, duration_minutes: dur });
    setTitle(""); setDue(""); setTime(""); setIsImportant(false); setIsUrgent(false); setDuration("15");
    refresh();
  }
  async function toggle(t: Task) { await api.taskPatch(t.id, { done: !t.done }); refresh(); }
  async function del(t: Task)    { await api.taskDelete(t.id); refresh(); }

  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, target: "today" | "doFirst" | "schedule" | "delegate" | "someday") => {
    e.preventDefault();
    if (!draggedId) return;
    const t = tasks.find(x => x.id === draggedId);
    if (!t) return;

    let patch: any = {};
    if (target === "today") {
      patch = { due_date: todayStr };
    } else {
      // If dropping into backlog, remove the due_date so it's not "today" anymore
      patch = { due_date: null };
      if (target === "doFirst")      { patch.is_important = true;  patch.is_urgent = true;  }
      else if (target === "schedule"){ patch.is_important = true;  patch.is_urgent = false; }
      else if (target === "delegate"){ patch.is_important = false; patch.is_urgent = true;  }
      else if (target === "someday") { patch.is_important = false; patch.is_urgent = false; }
    }

    // Optimistic update for UI responsiveness
    setTasks(tasks.map(x => x.id === draggedId ? { 
      ...x, 
      ...patch, 
      is_important: patch.is_important !== undefined ? (patch.is_important ? 1 : 0) : x.is_important, 
      is_urgent: patch.is_urgent !== undefined ? (patch.is_urgent ? 1 : 0) : x.is_urgent 
    } : x));
    
    setDraggedId(null);
    await api.taskPatch(draggedId, patch);
    refresh();
  };

  const shown = limit ? tasks.slice(0, limit) : tasks;
  const todayStr = todayLocal();

  const renderTask = (t: Task) => {
    const overdue = t.due_date && t.due_date < todayStr && !t.done;
    return (
      <div 
        key={t.id} 
        draggable
        onDragStart={(e) => handleDragStart(e, t.id)}
        className={cn("group flex items-center gap-3 py-3 px-4 mb-3 rounded-xl border transition-all shadow-sm cursor-grab active:cursor-grabbing",
          t.done ? "bg-secondary/30 border-border/40 opacity-60" : "bg-card border-border hover:border-primary/40 hover:shadow-md",
          draggedId === t.id && "opacity-50"
        )}>
        <input 
          type="checkbox" 
          checked={!!t.done} 
          onChange={() => toggle(t)}
          className="h-5 w-5 rounded-sm border-muted-foreground/40 text-primary focus:ring-primary cursor-pointer accent-primary shrink-0" 
        />
        <div className="flex-1 min-w-0">
          <div className={cn("text-[15px] font-medium truncate transition-colors", t.done && "line-through text-muted-foreground")}>
            {t.title}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            {(t.due_date || t.due_time) && (
              <div className={cn("text-[11px] font-semibold flex items-center gap-1", overdue ? "text-red-500" : "text-muted-foreground")}>
                {t.due_date && <span>{t.due_date === todayStr ? "Today" : t.due_date}</span>}
                {t.due_date && t.due_time && <span>•</span>}
                {t.due_time && <span>{t.due_time}</span>}
              </div>
            )}
            {!!(t.is_important || t.is_urgent) && <div className="w-px h-3 bg-border" />}
            {!!t.is_important && <span className="text-[10px] uppercase font-bold text-yellow-500 flex items-center gap-0.5"><Star className="h-3 w-3 fill-yellow-500" /> Important</span>}
            {!!t.is_urgent && <span className="text-[10px] uppercase font-bold text-red-500 flex items-center gap-0.5"><Flame className="h-3 w-3 fill-red-500" /> Urgent</span>}
          </div>
        </div>
        <button onClick={() => del(t)} className="opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-destructive shrink-0 p-2">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const isTodayOrOverdue = (t: Task) => t.due_date === todayStr || (t.due_date && t.due_date < todayStr && !t.done);
  
  const todayTasks = shown.filter(t => isTodayOrOverdue(t));
  const backlogTasks = shown.filter(t => !isTodayOrOverdue(t));

  const doFirst = backlogTasks.filter(t => !!t.is_important && !!t.is_urgent);
  const schedule = backlogTasks.filter(t => !!t.is_important && !t.is_urgent);
  const delegate = backlogTasks.filter(t => !t.is_important && !!t.is_urgent);
  const someday = backlogTasks.filter(t => !t.is_important && !t.is_urgent);

  return (
    <div className="space-y-8">
      {!compact && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
          <div className="flex gap-2 text-xs">
            {(["open", "done", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full font-medium transition-colors ${filter === f ? "bg-foreground text-background" : "bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"}`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button 
            onClick={syncGoogle} 
            disabled={syncing}
            className="rounded-full bg-secondary/80 hover:bg-secondary px-4 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
            Sync from Google
          </button>
        </div>
      )}

      {/* Frictionless Input - Brain Dump */}
      <div className="bg-secondary/20 border border-border/50 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 px-2">
          <Plus className="h-5 w-5 text-muted-foreground" />
          <input value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === "Enter" && add()}
            placeholder="Type a task and hit Enter to dump it into your backlog..."
            className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground/50 font-medium" />
        </div>
        
        {title.trim().length > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/50 animate-in fade-in slide-in-from-top-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* Date */}
              <div className="flex items-center rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs focus-within:border-primary transition-colors cursor-pointer">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                <input type="date" value={due} onChange={e => setDue(e.target.value)} className="bg-transparent outline-none text-foreground/90 cursor-pointer" />
              </div>
              
              {/* Time */}
              <div className="flex items-center rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs focus-within:border-primary transition-colors cursor-pointer">
                <Clock className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                <select value={time} onChange={e => setTime(e.target.value)} className="bg-transparent outline-none text-foreground/90 cursor-pointer pr-1">
                  <option value="">Any time</option>
                  {Array.from({length: 48}).map((_, i) => {
                    const h = Math.floor(i/2);
                    const m = i%2 === 0 ? "00" : "30";
                    const val = `${String(h).padStart(2,"0")}:${m}`;
                    const ampm = h >= 12 ? "PM" : "AM";
                    const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
                    return <option key={val} value={val}>{displayH}:{m} {ampm}</option>;
                  })}
                </select>
              </div>

              {/* Duration */}
              <div className="flex items-center gap-1 rounded-lg bg-background border border-border px-2.5 py-1.5 text-xs focus-within:border-primary transition-colors cursor-pointer">
                <Timer className="h-3.5 w-3.5 text-muted-foreground mr-1" />
                <select value={duration} onChange={e => setDuration(e.target.value)} className="bg-transparent outline-none text-foreground/90 cursor-pointer pr-1">
                  <option value="5">5 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">1 hour</option>
                  <option value="90">1.5 hours</option>
                  <option value="120">2 hours</option>
                  <option value="240">4 hours</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => setIsUrgent(!isUrgent)} 
                className={cn("rounded-lg border px-3 py-1.5 text-xs flex items-center gap-1.5 font-medium transition-colors", isUrgent ? "bg-red-500/10 text-red-500 border-red-500/30" : "bg-background border-border text-muted-foreground hover:bg-secondary")}>
                <Flame className={cn("h-3.5 w-3.5", isUrgent ? "fill-red-500" : "")} /> Urgent
              </button>
              <button onClick={() => setIsImportant(!isImportant)} 
                className={cn("rounded-lg border px-3 py-1.5 text-xs flex items-center gap-1.5 font-medium transition-colors", isImportant ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30" : "bg-background border-border text-muted-foreground hover:bg-secondary")}>
                <Star className={cn("h-3.5 w-3.5", isImportant ? "fill-yellow-500" : "")} /> Important
              </button>
              <button onClick={() => setDue(todayStr)} className="rounded-lg bg-background border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary transition-colors ml-1">
                Set to Today
              </button>
            </div>
            <button onClick={add} className="rounded-lg bg-primary text-primary-foreground px-5 py-1.5 text-sm font-semibold hover:opacity-90 ml-auto shadow-sm flex items-center gap-1">
              <Plus className="h-4 w-4" /> Save
            </button>
          </div>
        )}
      </div>

      {/* Focus of the Day */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-foreground flex items-center gap-2 px-1">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Focus of the Day
        </h2>
        <div 
          onDragOver={handleDragOver} 
          onDrop={(e) => handleDrop(e, "today")}
          className={cn("bg-primary/5 border-2 border-dashed border-primary/20 rounded-2xl p-4 min-h-[120px] transition-colors", draggedId && "border-primary/50 bg-primary/10")}
        >
          {todayTasks.length > 0 ? (
            todayTasks.map(renderTask)
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center py-6 text-muted-foreground pointer-events-none">
              <p className="text-sm font-medium text-foreground/70">Your slate is clear today.</p>
              <p className="text-xs mt-1">Enjoy the peace, or pull something from the backlog.</p>
            </div>
          )}
        </div>
      </div>

      {/* The Planning Backlog (Eisenhower Matrix) */}
      <div className="space-y-4 pt-6">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 px-1">
          Planning Backlog
        </h2>
        {compact ? (
          <div className="space-y-1">
            {backlogTasks.map(renderTask)}
            {backlogTasks.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No tasks.</div>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(doFirst.length > 0 || filter === "open" || draggedId) && (
              <div 
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, "doFirst")}
                className={cn("flex flex-col rounded-xl border-2 border-dashed border-border/50 bg-secondary/10 p-3 h-full transition-colors", draggedId && "border-red-500/30 bg-red-500/5")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-3 flex items-center gap-1 shrink-0 pointer-events-none">
                  <Flame className="h-3.5 w-3.5" /> Do First <span className="text-muted-foreground font-normal normal-case ml-1">(Urgent & Important)</span>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto max-h-[400px] pr-1">
                  {doFirst.length > 0 ? doFirst.map(renderTask) : <div className="text-xs text-muted-foreground px-2 py-4 text-center pointer-events-none">Drag tasks here</div>}
                </div>
              </div>
            )}
            {(schedule.length > 0 || filter === "open" || draggedId) && (
              <div 
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, "schedule")}
                className={cn("flex flex-col rounded-xl border-2 border-dashed border-border/50 bg-secondary/10 p-3 h-full transition-colors", draggedId && "border-blue-500/30 bg-blue-500/5")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-3 flex items-center gap-1 shrink-0 pointer-events-none">
                  <Star className="h-3.5 w-3.5" /> Schedule <span className="text-muted-foreground font-normal normal-case ml-1">(Important, Not Urgent)</span>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto max-h-[400px] pr-1">
                  {schedule.length > 0 ? schedule.map(renderTask) : <div className="text-xs text-muted-foreground px-2 py-4 text-center pointer-events-none">Drag tasks here</div>}
                </div>
              </div>
            )}
            {(delegate.length > 0 || filter === "open" || draggedId) && (
              <div 
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, "delegate")}
                className={cn("flex flex-col rounded-xl border-2 border-dashed border-border/50 bg-secondary/10 p-3 h-full transition-colors", draggedId && "border-orange-500/30 bg-orange-500/5")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-orange-500 mb-3 flex items-center gap-1 shrink-0 pointer-events-none">
                  <AlertCircle className="h-3.5 w-3.5" /> Delegate / Quick <span className="text-muted-foreground font-normal normal-case ml-1">(Urgent, Not Important)</span>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto max-h-[400px] pr-1">
                  {delegate.length > 0 ? delegate.map(renderTask) : <div className="text-xs text-muted-foreground px-2 py-4 text-center pointer-events-none">Drag tasks here</div>}
                </div>
              </div>
            )}
            {(someday.length > 0 || filter === "open" || draggedId) && (
              <div 
                onDragOver={handleDragOver} 
                onDrop={(e) => handleDrop(e, "someday")}
                className={cn("flex flex-col rounded-xl border-2 border-dashed border-border/50 bg-secondary/10 p-3 h-full transition-colors", draggedId && "border-muted-foreground/30 bg-secondary/20")}
              >
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1 shrink-0 pointer-events-none">
                  Someday <span className="text-muted-foreground font-normal normal-case ml-1">(Not Urgent, Not Important)</span>
                </div>
                <div className="flex-1 space-y-1 overflow-y-auto max-h-[400px] pr-1">
                  {someday.length > 0 ? someday.map(renderTask) : <div className="text-xs text-muted-foreground px-2 py-4 text-center pointer-events-none">Drag tasks here</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
