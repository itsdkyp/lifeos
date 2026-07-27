import { cn } from "@/lib/utils";

export function Card({ title, children, className }: {
  title?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn(
      "rounded-2xl border border-border bg-card/60 backdrop-blur",
      "shadow-sm hover:shadow-md transition-shadow p-5",
      className
    )}>
      {title && <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">{title}</div>}
      {children}
    </div>
  );
}
