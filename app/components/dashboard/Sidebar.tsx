"use client";

import { AnimatePresence, motion } from "framer-motion";
import { IconActivityHeartbeat, IconMenu2, IconPin, IconPinnedFilled, IconX, type Icon } from "@tabler/icons-react";
import { useState, type ReactNode } from "react";

export interface NavItem<Id extends string> {
  id: Id;
  label: string;
  icon: Icon;
}

const COLLAPSED = 64;
const EXPANDED = 224;
const EASE = [0.4, 0, 0.2, 1] as const;

/**
 * Dashboard navigation. On desktop it's a rail of icons that slides open on
 * hover or keyboard focus, and can be pinned open. On phones it's a top bar
 * with a menu button that slides the full list in.
 */
export function Sidebar<Id extends string>({
  items,
  active,
  onSelect,
  footer,
}: {
  items: NavItem<Id>[];
  active: Id | null;
  onSelect: (id: Id) => void;
  /** Bottom area, e.g. the signed-in account; gets whether the sidebar is open. */
  footer: (open: boolean) => ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = pinned || hovered;

  const list = (expanded: boolean, after?: () => void) => (
    <ul className="flex flex-col gap-1 px-2">
      {items.map(({ id, label, icon: ItemIcon }) => {
        const current = id === active;
        return (
          <li key={id}>
            <button
              onClick={() => {
                onSelect(id);
                after?.();
              }}
              aria-label={label}
              aria-current={current ? "page" : undefined}
              className={`flex h-11 w-full items-center gap-3 rounded-xl px-3.5 text-left text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-lime-400 ${
                current ? "bg-lime-400 text-black" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              }`}
            >
              <ItemIcon size={20} stroke={2} className="shrink-0" aria-hidden />
              <Label show={expanded}>{label}</Label>
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {/* Desktop: the rail is fixed and slides open over the page, so hovering
          never moves the page. This placeholder holds the rail's place, and
          widens only while the rail is pinned open. */}
      <motion.div
        aria-hidden
        initial={false}
        animate={{ width: pinned ? EXPANDED : COLLAPSED }}
        transition={{ duration: 0.3, ease: EASE }}
        className="hidden shrink-0 md:block"
      />
      <motion.nav
        aria-label="Dashboard"
        initial={false}
        animate={{ width: open ? EXPANDED : COLLAPSED }}
        transition={{ duration: 0.3, ease: EASE }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
        }}
        className="fixed top-0 left-0 z-40 hidden h-dvh flex-col border-r border-zinc-800 bg-zinc-900 shadow-2xl md:flex"
      >
        {/* Only the header and list clip their labels; the footer doesn't, so menus can pop out of it. */}
        <div className="flex h-16 items-center gap-2.5 overflow-hidden px-[18px]">
          <IconActivityHeartbeat size={28} className="shrink-0 text-lime-400" aria-hidden />
          <Label show={open} className="text-base font-bold">
            Home Rehab
          </Label>
          <AnimatePresence>
            {open ? (
              <motion.button
                key="pin"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                onClick={() => setPinned((p) => !p)}
                aria-pressed={pinned}
                aria-label={pinned ? "Unpin sidebar" : "Pin sidebar open"}
                title={pinned ? "Unpin sidebar" : "Pin sidebar open"}
                className={`ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-lime-400 ${
                  pinned ? "bg-lime-400/20 text-lime-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {pinned ? <IconPinnedFilled size={16} aria-hidden /> : <IconPin size={16} aria-hidden />}
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>
        <div className="mt-2 flex-1 overflow-hidden">{list(open)}</div>
        {/* px-3 centers the 40 px avatar in the 64 px collapsed rail. */}
        <div className="border-t border-zinc-800 px-3 py-3">{footer(open)}</div>
      </motion.nav>

      {/* Phones: top bar with a slide-in menu. */}
      <div className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-800 bg-zinc-900 px-4 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="flex h-12 w-12 items-center justify-center rounded-xl text-white hover:bg-zinc-800"
        >
          <IconMenu2 size={28} aria-hidden />
        </button>
        <IconActivityHeartbeat size={28} className="text-lime-400" aria-hidden />
        <span className="text-xl font-bold">Home Rehab</span>
      </div>
      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            key="mobile-menu"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.3, ease: EASE }}
            className="fixed inset-0 z-50 flex flex-col bg-zinc-900 md:hidden"
          >
            <div className="flex h-16 items-center justify-end px-4">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
                className="flex h-12 w-12 items-center justify-center rounded-xl text-white hover:bg-zinc-800"
              >
                <IconX size={28} aria-hidden />
              </button>
            </div>
            <div className="flex-1">{list(true, () => setMobileOpen(false))}</div>
            <div className="border-t border-zinc-800 p-4">{footer(true)}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Text that fades and slides away when the rail collapses. */
export function Label({ show, children, className = "" }: { show: boolean; children: ReactNode; className?: string }) {
  return (
    <motion.span
      initial={false}
      animate={{ opacity: show ? 1 : 0, x: show ? 0 : -8 }}
      transition={{ duration: 0.2 }}
      className={`truncate whitespace-nowrap ${className}`}
      aria-hidden={!show}
    >
      {children}
    </motion.span>
  );
}
