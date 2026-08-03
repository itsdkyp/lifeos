"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, ApiError, type Profile } from "@/lib/api";

type Ctx = {
  profile: Profile | null;
  loading: boolean;
  // True when the last profile fetch failed with 401 — i.e. this is a fresh
  // browser/device that hasn't registered the LIFEOS_TOKEN yet, NOT a brand-new
  // user with no profile row. Distinguishing the two matters: the onboarding
  // modal should never show for "wrong/missing token", only for "no profile yet".
  unauthorized: boolean;
  refresh: () => Promise<void>;
  save: (p: Profile) => Promise<void>;
};
const ProfileCtx = createContext<Ctx>({ profile: null, loading: true, unauthorized: false, refresh: async () => {}, save: async () => {} });

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const p = await api.profileGet();
      setProfile(p);
      setUnauthorized(false);
    } catch (e) {
      setProfile(null);
      setUnauthorized(e instanceof ApiError && e.status === 401);
    } finally { setLoading(false); }
  }, []);

  const save = useCallback(async (p: Profile) => {
    await api.profileSave(p);
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return <ProfileCtx.Provider value={{ profile, loading, unauthorized, refresh, save }}>{children}</ProfileCtx.Provider>;
}

export const useProfile = () => useContext(ProfileCtx);

// Local-time formatter for stored UTC ISO timestamps.
export function fmtLocal(iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" }): string {
  try { return new Intl.DateTimeFormat(undefined, opts).format(new Date(iso)); }
  catch { return iso; }
}
export function fmtLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
export function fmtLocalTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function daysAlive(dob?: string | null): number | null {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  return Math.floor((Date.now() - b.getTime()) / 864e5);
}

export function ageYears(dob?: string | null): number | null {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00");
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

// Convenience: currency symbol for common codes.
export function currencySymbol(code?: string | null): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥", CNY: "¥",
    AUD: "A$", CAD: "C$", CHF: "CHF", SEK: "kr", NZD: "NZ$",
  };
  return map[code ?? "USD"] ?? code ?? "$";
}
