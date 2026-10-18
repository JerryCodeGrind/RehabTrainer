// Today's exercise plan, chosen by ChatGPT from the user's health record (see
// lib/ehr/server.ts), or the five basic exercises without one. Only the plan is
// kept, in localStorage, never the record. A plan belongs to whoever saved it,
// so a different account on the same browser never sees someone else's plan.
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
  /** Whose plan this is: the account id ("google:<sub>"), or "device" without sign-in. */
  owner: string;
  /** The five basic exercises, chosen without a health record. */
  basic?: boolean;
}

/** The exercises for someone who continues without a health record. */
export const BASIC_ROUTINES: RoutineId[] = ["sitToStand", "marching", "walk", "singleLeg", "stretches"];

export function basicPlan(): Omit<CarePlan, "owner"> {
  return {
    routines: [...BASIC_ROUTINES],
    reasons: {},
    summary: "The five basic exercises, since there's no health record yet.",
    planId: null,
    fileName: "",
    createdAt: new Date().toISOString(),
    basic: true,
  };
}

// Who's using the app now; plans are saved for them (see setPlanOwner).
let currentOwner: string | null = null;

/** Set by the app to the signed-in account id, "device", or null when nobody is in yet. */
export function setPlanOwner(owner: string | null) {
  currentOwner = owner;
}

/** The stored plan if it belongs to `owner`, else null: other people's plans are never shown. */
export function planFor(plan: CarePlan | null, owner: string | null): CarePlan | null {
  return plan && owner && plan.owner === owner ? plan : null;
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

/** Saves the plan for whoever is using the app now. */
export function savePlan(plan: Omit<CarePlan, "owner">) {
  write({ ...plan, owner: currentOwner ?? "device" });
}

export function clearPlan() {
  write(null);
}
