"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, BookHeart, CheckSquare, Repeat, Wallet, Timer, Sparkles, MessageSquare, Focus, Plus, Settings, Scale, Apple, TrendingUp, Sun, Moon, LineChart, Landmark, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { CommandPalette } from "./command-palette";
import { ProfileProvider, useProfile } from "@/lib/profile";
import { OnboardingModal } from "./onboarding";
import { ThemeProvider, useTheme } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { AuthGate } from "./auth-gate";

type NavItem = { href: string; label: string; icon: any };
type Section = { label?: string; href?: string; icon?: any; items: NavItem[] };
const sections: Section[] = [
  { items: [
    { href: "/",        label: "Home",    icon: LayoutDashboard },
    { href: "/journal", label: "Journal", icon: BookHeart },
    { href: "/tasks",   label: "Tasks",   icon: CheckSquare },
    { href: "/habits",  label: "Habits",  icon: Repeat },
  ] },
  { label: "Time",   href: "/time",   icon: Timer,  items: [
    { href: "/time",    label: "Time & Focus",    icon: Timer },
  ] },
  { label: "Money",  href: "/money",  icon: Wallet, items: [
    { href: "/money",   label: "Overview",    icon: Wallet },
    { href: "/accounts",label: "Accounts",    icon: Landmark },
    { href: "/finance", label: "Expenses",    icon: Wallet },
    { href: "/invest",  label: "Investments", icon: TrendingUp },
  ] },
  { label: "Health", href: "/health", icon: Activity, items: [
    { href: "/health",  label: "Health & Body",    icon: Activity },
  ] },
  { items: [
    { href: "/insights",label: "Insights", icon: LineChart },
    { href: "/chat",    label: "Chat",     icon: MessageSquare },
    { href: "/settings",label: "Settings", icon: Settings },
  ] },
];
// Flat list for mobile bottom nav
const items = sections.flatMap(s => s.items);

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <ProfileProvider>
            <ShellInner>{children}</ShellInner>
          </ProfileProvider>
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { profile, loading } = useProfile();
  const [timerActive, setTimerActive] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        // Reuse the shared helper so we pick up the auth token if configured.
        const a = await api.timeActive();
        setTimerActive(Boolean(a && !a.ended_at && a.id));
      } catch {}
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen(v => !v); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      {/* Sidebar (md+) */}
      <aside className="hidden md:flex md:flex-col w-56 shrink-0 border-r border-border bg-card/40 backdrop-blur px-3 py-6 gap-1 sticky top-0 h-screen overflow-y-auto">
        <div className="px-3 pb-6 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight flex items-baseline">LifeOS<span className="text-blue-500 font-black text-2xl leading-none">.</span></div>
            <div className="text-xs text-muted-foreground">your life, tracked</div>
          </div>
          <ThemeIcon />
        </div>
        {sections.map((sec, i) => (
          <div key={i} className={i > 0 ? "mt-3" : ""}>
            {sec.label && (
              sec.href ? (
                <Link href={sec.href}
                  className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition">
                  {sec.icon && <sec.icon className="h-3 w-3" />}
                  {sec.label}
                </Link>
              ) : (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {sec.label}
                </div>
              )
            )}
            {sec.items.map(({ href, label, icon: Icon }) => {
              const active = p === href;
              const showDot = href === "/time" && timerActive;
              return (
                <Link key={href} href={href}
                  className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors relative",
                    active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {showDot && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="mt-auto px-3 pt-6">
          <button onClick={() => setPaletteOpen(true)}
            className="w-full flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary/60">
            <Plus className="h-3.5 w-3.5" /> Quick log <span className="ml-auto opacity-70">⌘K</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-4 pb-24 md:p-8 md:pb-8 overflow-x-hidden">
        {children}
      </main>

      {/* Mobile bottom nav + FAB */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        <div className="flex overflow-x-auto no-scrollbar items-stretch">
          {items.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? p === "/" : p.startsWith(href);
            const showDot = href === "/time" && timerActive;
            return (
              <Link key={href} href={href}
                className={cn("shrink-0 flex flex-col items-center gap-0.5 py-2 px-3 text-[10px] min-w-[64px] relative",
                  active ? "text-foreground" : "text-muted-foreground")}>
                <span className="relative">
                  <Icon className={cn("h-5 w-5", active && "text-primary")} />
                  {showDot && <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
      <button onClick={() => setPaletteOpen(true)}
        aria-label="Quick log"
        className="md:hidden fixed right-4 bottom-20 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition">
        <Plus className="h-6 w-6" />
      </button>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      {/* AuthGate (wrapping this whole Shell) already guarantees we're authenticated by
          the time this renders, so !profile here can only mean "genuinely no profile
          row yet" — no more "auth failure disguised as new user" case to worry about.
          One known gap: /session/setup creates a minimal profile (name=username) on
          first run, so a brand-new install won't actually hit this "no profile" case—
          the fuller onboarding (DOB, currency, values, goal) has to be filled in via
          Settings afterward rather than being proactively prompted. Acceptable trade
          for now; revisit if that friction turns out to matter. */}
      <OnboardingModal open={!loading && !profile} />
    </div>
  );
}

function ThemeIcon() {
  const { resolved, setMode } = useTheme();
  const Icon = resolved === "dark" ? Sun : Moon;
  return (
    <button
      aria-label="Toggle theme"
      title={resolved === "dark" ? "Switch to light" : "Switch to dark"}
      onClick={() => setMode(resolved === "dark" ? "light" : "dark")}
      className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition">
      <Icon className="h-4 w-4" />
    </button>
  );
}
