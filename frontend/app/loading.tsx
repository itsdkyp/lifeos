import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    </div>
  );
}
