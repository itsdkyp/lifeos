"use client";
import { useEffect } from "react";

// Runs when even the root layout fails to render. Must be self-contained
// (no external <Card>, no lucide, no shell).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ background: "#0a0a0b", color: "#fafafa", fontFamily: "system-ui, sans-serif", margin: 0, padding: "6vh 5vw", minHeight: "100vh" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.05)", borderRadius: 16, padding: 24 }}>
          <h2 style={{ margin: "0 0 12px", fontSize: 20 }}>LifeOS could not start.</h2>
          <p style={{ color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, margin: "0 0 12px" }}>
            The root layout crashed. This usually means a build error or a bad theme/profile record.
          </p>
          {error?.message && (
            <pre style={{ background: "#000", color: "#fca5a5", padding: 12, borderRadius: 8, fontSize: 12, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", border: "1px solid #27272a" }}>
              {error.message}
            </pre>
          )}
          <button onClick={reset}
            style={{ marginTop: 16, background: "#fafafa", color: "#0a0a0b", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
