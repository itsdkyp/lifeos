import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label, value, sub, tone = "default", icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: LucideIcon;
}) {
  const toneCls =
    tone === "good" ? "text-emerald-500" :
    tone === "warn" ? "text-amber-500"  :
    tone === "bad"  ? "text-red-500"    : "";
  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tabular-nums", toneCls)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
