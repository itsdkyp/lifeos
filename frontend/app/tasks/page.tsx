import { Card } from "@/components/card";
import { TaskList } from "@/components/task-list";

export default function Page() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">Plan what to do. Syncs to today's Obsidian note when due today.</p>
      </header>
      <Card><TaskList /></Card>
    </div>
  );
}
