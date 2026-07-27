"use client";
import { useState } from "react";
import { api, type WeeklyReview } from "@/lib/api";
import { Card } from "@/components/card";
import { Sparkles, RefreshCw } from "lucide-react";

export default function Page() {
  const [r, setR] = useState<WeeklyReview | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try { setR(await api.weeklyReview()); }
    catch (e: any) { setR({ review: null, error: String(e.message ?? e), data: null }); }
    finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Weekly review</h1>
          <p className="text-sm text-muted-foreground">Sunday ritual. Your data → a compassionate summary.</p>
        </div>
        <button onClick={run} disabled={loading}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Reflecting…" : r ? "Regenerate" : "Generate"}
        </button>
      </header>

      {!r && !loading && (
        <Card>
          <div className="text-sm text-muted-foreground text-center py-16">
            Click <b>Generate</b> to have an LLM read your last 7 days and produce a warm, specific review.
            <br />Needs the LiteLLM proxy running.
          </div>
        </Card>
      )}

      {r?.error && (
        <Card>
          <div className="text-sm text-destructive">Error: {r.error}</div>
          <div className="text-xs text-muted-foreground mt-2">
            Make sure <code className="text-foreground">make proxy</code> is running on :4000, and you've set a valid model in <code className="text-foreground">llm-proxy/config.yaml</code>.
          </div>
        </Card>
      )}

      {r?.review && (
        <Card>
          <article className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap leading-relaxed">
            {r.review}
          </article>
        </Card>
      )}
    </div>
  );
}
