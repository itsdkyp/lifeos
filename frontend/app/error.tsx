"use client";
import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface to console so the underlying stack is not lost.
    console.error("[app error]", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 text-destructive" />
          <h2 className="text-lg font-semibold">Something went sideways</h2>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          This route crashed while rendering. Your data is safe — nothing was written.
        </p>
        {error?.message && (
          <pre className="text-xs bg-background/60 border border-border rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all">
            {error.message}
          </pre>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <button onClick={reset}
            className="rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
          <Link href="/"
            className="rounded-md bg-secondary text-foreground border border-border px-3 py-2 text-sm font-medium hover:bg-secondary/80 flex items-center gap-2">
            <Home className="h-4 w-4" /> Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
