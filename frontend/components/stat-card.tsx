import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label, value, sub, tone = "default", icon: Icon, compact = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
  icon?: LucideIcon;
  compact?: boolean;
}) {
  const toneCls =
    tone === "good" ? "text-emerald-500" :
    tone === "warn" ? "text-amber-500"  :
    tone === "bad"  ? "text-red-500"    : "";
  return (
    <div className={cn("rounded-2xl border border-border bg-card/60 backdrop-blur shadow-sm hover:shadow-md transition-shadow", compact ? "p-3" : "p-5")}>
      <div className="flex items-center justify-between">
        <div className={cn("font-medium uppercase tracking-wider text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>{label}</div>
        {Icon && <Icon className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />}
      </div>
      <div className={cn("font-semibold tabular-nums tracking-tight", toneCls, compact ? "mt-1.5 text-lg sm:text-xl" : "mt-2 text-2xl sm:text-3xl truncate")}>{value}</div>
      {sub && <div className={cn("text-muted-foreground truncate", compact ? "mt-0.5 text-[10px]" : "mt-1 text-xs")}>{sub}</div>}
    </div>
  );
}
