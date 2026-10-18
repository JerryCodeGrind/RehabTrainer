"use client";

import { Activity, Keyboard, LayoutDashboard, LifeBuoy, LogOut, PersonStanding, TrendingUp, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Wordmark } from "./Brand";

export type NavKey = "overview" | "rehab" | "progress" | "body";

const NAV: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: "overview", label: "overview", icon: LayoutDashboard },
  { key: "rehab", label: "rehabilitation", icon: Activity },
  { key: "progress", label: "progress", icon: TrendingUp },
  { key: "body", label: "my body", icon: PersonStanding },
];

export interface Account {
  name: string | null;
  email: string | null;
  image: string | null;
}

function Avatar({ account, size = "h-8 w-8" }: { account: Account | null; size?: string }) {
  const letter = (account?.name ?? account?.email ?? "").trim().charAt(0);
  if (account?.image) {
    // eslint-disable-next-line @next/next/no-img-element -- Google avatar URL; no remote image config needed.
    return <img src={account.image} alt="" referrerPolicy="no-referrer" className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-semibold text-brand`}>
      {letter || <UserRound className="h-4 w-4" />}
    </span>
  );
}

/**
 * App frame: a quiet sidebar with the four destinations on desktop; a compact
 * header and bottom tabs on phones. `focus` drops the navigation for the live
 * exercise screen.
 */
export function AppShell({
  current,
  focus = false,
  onNavigate,
  onProfile,
  profileActive,
  onHelp,
  helpOpen,
  onSignOut,
  account,
  demo,
  children,
}: {
  current: NavKey | null;
  focus?: boolean;
  onNavigate: (key: NavKey) => void;
  onProfile: () => void;
  profileActive: boolean;
  onHelp: () => void;
  helpOpen: boolean;
  /** Absent when using the app without an account. */
  onSignOut?: () => void;
  account: Account | null;
  demo: boolean;
  children: ReactNode;
}) {
  const activeIndex = NAV.findIndex((n) => n.key === current);
  return (
    <div className={`relative flex min-h-full flex-1 flex-col bg-bg ${focus ? "" : "max-lg:[--nav-h:4.5rem]"}`}>
      {demo ? (
        <p className={`flex items-center justify-center gap-2 border-b border-sky/30 bg-sky-tint px-4 py-2 text-center text-sm text-sky-ink ${focus ? "" : "lg:pl-[var(--sidebar-w)]"}`}>
          <Keyboard className="h-4 w-4" aria-hidden /> demo mode: keyboard controls, no camera
        </p>
      ) : null}

      {focus ? null : (
        <>
          {/* Desktop sidebar */}
          <nav aria-label="main" className="fixed inset-y-0 left-0 z-20 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface px-3 pt-6 pb-4 lg:flex">
            <button type="button" onClick={() => onNavigate("overview")} className="mb-8 self-start rounded-[var(--radius-control)] px-3 py-1">
              <Wordmark compact />
            </button>
            <ul className="relative flex flex-col gap-0.5">
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-11 rounded-[var(--radius-control)] bg-brand-tint transition-[transform,opacity] duration-300 ease-[var(--ease-out)] ${activeIndex < 0 ? "opacity-0" : ""}`}
                style={{ transform: `translateY(${Math.max(0, activeIndex) * 46}px)` }}
              />
              {NAV.map(({ key, label, icon: Icon }) => {
                const active = current === key;
                return (
                  <li key={key} className="relative">
                    <button
                      type="button"
                      onClick={() => onNavigate(key)}
                      aria-current={active ? "page" : undefined}
                      className={`press flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-[0.95rem] hover:shadow-none ${
                        active ? "font-semibold text-brand" : "text-ink-2 hover:text-ink"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
              <button
                type="button"
                onClick={onHelp}
                aria-expanded={helpOpen}
                className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-[0.95rem] transition-colors duration-150 ${
                  helpOpen ? "bg-bg-2 text-ink" : "text-ink-2 hover:bg-bg-2 hover:text-ink"
                }`}
              >
                <LifeBuoy className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                help
              </button>
              <button
                type="button"
                onClick={onProfile}
                aria-current={profileActive ? "page" : undefined}
                className={`flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left transition-colors duration-150 ${
                  profileActive ? "bg-bg-2" : "hover:bg-bg-2"
                }`}
              >
                <Avatar account={account} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold text-ink">{account?.name ?? "this device"}</span>
                  {account?.email ? <span className="keep-case truncate text-xs text-ink-2">{account.email}</span> : null}
                </span>
              </button>
              {onSignOut ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="flex min-h-11 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left text-sm text-ink-2 transition-colors duration-150 hover:bg-bg-2 hover:text-ink"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  sign out
                </button>
              ) : null}
            </div>
          </nav>

          {/* Phone header */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2 backdrop-blur lg:hidden">
            <button type="button" onClick={() => onNavigate("overview")} className="rounded-[var(--radius-control)] py-1">
              <Wordmark compact />
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onHelp}
                aria-expanded={helpOpen}
                aria-label="help"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 hover:bg-bg-2 hover:text-ink"
              >
                <LifeBuoy className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </button>
              <button
                type="button"
                onClick={onProfile}
                aria-label="profile and settings"
                aria-current={profileActive ? "page" : undefined}
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-bg-2"
              >
                <Avatar account={account} size="h-8 w-8" />
              </button>
            </div>
          </header>

          {/* Phone bottom tabs */}
          <nav aria-label="main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            <ul className="relative grid h-[4.5rem] grid-cols-4">
              <span
                aria-hidden
                className={`absolute top-[0.6rem] left-0 flex w-1/4 justify-center transition-[transform,opacity] duration-300 ease-[var(--ease-out)] ${activeIndex < 0 ? "opacity-0" : ""}`}
                style={{ transform: `translateX(${Math.max(0, activeIndex) * 100}%)` }}
              >
                <span className="h-7 w-14 rounded-full bg-brand-tint" />
              </span>
              {NAV.map(({ key, label, icon: Icon }) => {
                const active = current === key;
                return (
                  <li key={key} className="relative">
                    <button
                      type="button"
                      onClick={() => onNavigate(key)}
                      aria-current={active ? "page" : undefined}
                      aria-label={label}
                      className={`flex h-full w-full flex-col items-center justify-center gap-1 text-[0.7rem] transition-colors duration-200 ${active ? "font-semibold text-brand" : "text-ink-3"}`}
                    >
                      <span className={`flex h-7 w-12 items-center justify-center transition-transform duration-300 ${active ? "-translate-y-px scale-110" : ""}`}>
                        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      </span>
                      {label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}

      <div className={`relative flex flex-1 flex-col ${focus ? "" : "pb-[var(--nav-h)] lg:pl-[var(--sidebar-w)]"}`}>{children}</div>
    </div>
  );
}
