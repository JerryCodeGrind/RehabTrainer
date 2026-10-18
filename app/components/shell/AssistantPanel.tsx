"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Assistant } from "@/app/assistant";

/**
 * Help panel that slides in from the right. The conversation mounts on first
 * open and stays mounted afterwards, so closing and reopening keeps it.
 * Escape or a press anywhere outside the panel closes it.
 */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    // Focus the message box once the panel has rendered.
    const id = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("textarea")?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // A press anywhere outside the panel closes it, except on the help buttons
    // (they toggle it themselves) and on pop-ups the chat opens outside the panel.
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.isConnected || panelRef.current?.contains(target)) return;
      if (target.closest('[data-help-toggle], [role="menu"], [role="listbox"], [role="dialog"], [role="tooltip"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      returnFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-[44] bg-ink/20 transition-opacity duration-200 lg:hidden ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        ref={panelRef}
        aria-label="help"
        inert={!open}
        className={`fixed inset-y-0 right-0 z-[45] flex w-full flex-col border-l border-line bg-surface pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-[var(--shadow-float)] transition-transform duration-200 ease-out sm:w-[26rem] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold text-ink">help</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close help"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-bg-2 hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1">
          <Assistant />
        </div>
      </aside>
    </>
  );
}
