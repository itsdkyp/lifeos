"use client";
import { useState } from "react";
import { Card } from "@/components/card";
import { TaskList } from "@/components/task-list";
import { TaskCalendar } from "@/components/task-calendar";

export default function Page() {
  const [view, setView] = useState<"list" | "calendar">("list");

  return (
    <div className="mx-auto max-w-5xl 2xl:max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground">Plan what to do. Syncs to today's Obsidian note when due today.</p>
        </div>
        <div className="flex gap-1 bg-secondary/30 p-1 rounded-md">
          <button onClick={() => setView("list")} 
            className={`px-3 py-1 text-xs rounded-sm transition ${view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            List
          </button>
          <button onClick={() => setView("calendar")} 
            className={`px-3 py-1 text-xs rounded-sm transition ${view === "calendar" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            Calendar
          </button>
        </div>
      </header>
      <Card>
        {view === "list" ? <TaskList /> : <TaskCalendar />}
      </Card>
    </div>
  );
}
