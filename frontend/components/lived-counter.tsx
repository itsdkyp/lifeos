"use client";
import { useEffect, useRef, useState } from "react";

export function LivedCounter({ dob }: { dob: string }) {
  const [, tick] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = () => { tick(t => t + 1); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const birth = new Date(dob + "T00:00:00").getTime();
  if (isNaN(birth)) return null;

  const originMs = performance.timeOrigin + performance.now();
  const totalMs = originMs - birth;
  if (totalMs < 0) return null;

  const totalSec = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSec / 86400);
  // ponytail: dropped hours — days + minutes covers the granularity users care about.
  const mins = Math.floor((totalSec % 86400) / 60);
  const secs = totalSec % 60;
  const micros = Math.floor((totalMs % 1000) * 1000);

  return (
    <span className="tabular-nums">
      <b className="text-foreground">{days.toLocaleString()}</b>d{" "}
      <span className="text-foreground">{String(mins).padStart(2, "0")}</span>m{" "}
      <span className="text-foreground">{String(secs).padStart(2, "0")}</span>s{" "}
      <span className="text-foreground/60 text-xs">{String(micros).padStart(6, "0")}μs</span>{" "}
      on Earth
    </span>
  );
}
