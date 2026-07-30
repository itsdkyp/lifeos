import Link from "next/link";
import { Home, Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-6xl font-semibold tracking-tight text-muted-foreground/60">404</div>
        <h2 className="text-lg font-semibold">Nothing here.</h2>
        <p className="text-sm text-muted-foreground">
          This route doesn't exist in LifeOS. Maybe it moved, maybe it never was.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link href="/"
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 flex items-center gap-2">
            <Home className="h-4 w-4" /> Dashboard
          </Link>
          <Link href="/insights"
            className="rounded-md bg-secondary text-foreground border border-border px-3 py-2 text-sm font-medium hover:bg-secondary/80 flex items-center gap-2">
            <Compass className="h-4 w-4" /> Insights
          </Link>
        </div>
      </div>
    </div>
  );
}
