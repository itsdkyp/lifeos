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
    <div className={cn("rounded-2xl border border-border bg-card/60 backdrop-blur shadow-sm hover:shadow-md transition-shadow", compact ? "p-3 2xl:p-4" : "p-5 2xl:p-6")}>
      <div className="flex items-center justify-between">
        <div className={cn("font-medium uppercase tracking-wider text-muted-foreground", compact ? "text-[10px] 2xl:text-xs" : "text-xs 2xl:text-sm")}>{label}</div>
        {Icon && <Icon className={cn("text-muted-foreground", compact ? "h-3.5 w-3.5 2xl:h-4 2xl:w-4" : "h-4 w-4 2xl:h-5 2xl:w-5")} />}
      </div>
      <div className={cn("font-semibold tabular-nums tracking-tight", toneCls, compact ? "mt-1.5 text-lg sm:text-xl 2xl:text-2xl" : "mt-2 text-2xl sm:text-3xl 2xl:text-4xl truncate")}>{value}</div>
      {sub && <div className={cn("text-muted-foreground truncate", compact ? "mt-0.5 text-[10px] 2xl:text-xs" : "mt-1 text-xs 2xl:text-sm")}>{sub}</div>}
    </div>
  );
}
