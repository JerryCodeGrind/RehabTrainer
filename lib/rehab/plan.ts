// Today's exercise plan, chosen by ChatGPT from the user's health record (see
// lib/ehr/server.ts). Only the plan is kept, in localStorage, never the record.
// Exposed as an external store for useSyncExternalStore, like storage.ts.

import type { RoutineId } from "./routines/types";

/** What /api/ehr/plan returns. */
export interface PlanChoice {
  /** Chosen routines, in session order. Empty if none are safe today. */
  routines: RoutineId[];
  /** One plain-language sentence per chosen routine. */
  reasons: Partial<Record<RoutineId, string>>;
  /** A sentence or two for the user about the overall choice. */
  summary: string;
}

export interface CarePlan extends PlanChoice {
  /** The plan's document in MongoDB, or null if it wasn't saved there. */
  planId: string | null;
  fileName: string;
  /** ISO timestamp. */
  createdAt: string;
}

const KEY = "rehab.plan.v1";
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: CarePlan | null } | null = null;

function read(): CarePlan | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache?.value ?? null;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value: CarePlan | null = null;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.routines)) value = parsed;
  } catch {
    // Corrupt data: ask for the record again rather than crash.
  }
  cache = { raw, value };
  return value;
}

function write(plan: CarePlan | null) {
  const raw = plan ? JSON.stringify(plan) : null;
  cache = { raw, value: plan };
  try {
    if (raw) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked: keep the in-memory copy for this visit.
  }
  listeners.forEach((l) => l());
}

export const planStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => e.key === KEY && listener();
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot: read,
  getServerSnapshot: () => null,
};

export function savePlan(plan: CarePlan) {
  write(plan);
}

export function clearPlan() {
  write(null);
}
