"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Mode = "light" | "dark" | "system";
const Ctx = createContext<{ mode: Mode; setMode: (m: Mode) => void; resolved: "light" | "dark" }>({
  mode: "system", setMode: () => {}, resolved: "dark",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("dark");

  // Load saved preference once on mount
  useEffect(() => {
    const saved = (localStorage.getItem("lifeos-theme") as Mode | null) ?? "system";
    setModeState(saved);
  }, []);

  // Apply theme whenever mode or system pref changes
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.classList.toggle("light", !dark);
      setResolved(dark ? "dark" : "light");
    };
    apply();
    if (mode === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [mode]);

  const setMode = (m: Mode) => { localStorage.setItem("lifeos-theme", m); setModeState(m); };

  return <Ctx.Provider value={{ mode, setMode, resolved }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
