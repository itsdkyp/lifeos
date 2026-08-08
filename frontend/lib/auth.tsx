"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setUnauthorizedHandler } from "@/lib/api";

type AuthState = {
  loading: boolean;
  configured: boolean;
  authenticated: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>({
  loading: true, configured: false, authenticated: false,
  refresh: async () => {}, login: async () => {}, setup: async () => {}, logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const s = await api.sessionStatus();
      setConfigured(s.configured);
      setAuthenticated(s.authenticated);
    } catch {
      // /session/status itself is always open (never 401s) — a network/parse failure
      // here means something's actually down, not "not logged in". Fail closed either way.
      setConfigured(false);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Any 401 from ANY API call, anywhere in the app, flips us back to the login gate
    // immediately — not just on the initial page load. Covers a session being revoked
    // (logged out from another device/tab) while this tab is still open.
    setUnauthorizedHandler(() => setAuthenticated(false));
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    await api.sessionLogin(username, password);
    await refresh();
  }, [refresh]);

  const setup = useCallback(async (username: string, password: string) => {
    await api.sessionSetup(username, password);
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api.sessionLogout();
    setAuthenticated(false);
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, configured, authenticated, refresh, login, setup, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
