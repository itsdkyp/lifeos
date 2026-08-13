"use client";
import { useEffect } from "react";

// Registers /sw.js once on first mount. Lives outside Shell so it's
// loaded before auth gating — the SW must register on every page load,
// including the login screen, or Chrome won't count it as "registered".
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {}); // silently ignore — no SW = no offline, not a crash
    }
  }, []);
  return null;
}
