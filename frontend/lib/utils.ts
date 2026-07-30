import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// LifeOS convention: dates are ALWAYS local (browser timezone).
// The backend also stores + queries in local time (SQL `date(ts,'localtime')`).
// Never use `new Date().toISOString().slice(0,10)` — that's UTC, will off-by-one in negative offsets.
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function dateLocal(d: Date | string | number): string {
  const dt = typeof d === "string" || typeof d === "number" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
}
