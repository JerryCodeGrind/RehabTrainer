// Session history in localStorage, exposed as an external store for
// useSyncExternalStore. The server snapshot is empty, so nothing date-dependent
// renders during prerendering.

import type { Metric, RoutineId } from "./routines/types";

export type Feeling = "easy" | "right" | "hard";

export interface SessionRecord {
  id: string;
  routineId: RoutineId;
  /** ISO timestamps. */
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  reps: number;
  target: number;
  metrics: Metric[];
  data: Record<string, unknown>;
  feeling?: Feeling;
}

const KEY = "rehab.sessions.v1";
const EMPTY: SessionRecord[] = [];
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: SessionRecord[] } | null = null;

function read(): SessionRecord[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache?.value ?? EMPTY;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed;
  } catch {
    // Corrupt data: start fresh rather than crash.
  }
  cache = { raw, value };
  return value;
}

function write(sessions: SessionRecord[]) {
  const raw = JSON.stringify(sessions);
  cache = { raw, value: sessions };
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Storage full or blocked: keep the in-memory copy for this visit.
  }
  listeners.forEach((l) => l());
}

export const sessionStore = {
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
  getServerSnapshot: () => EMPTY,
};

export function saveSession(record: SessionRecord) {
  write([...read(), record]);
}

export function setFeeling(id: string, feeling: Feeling) {
  write(read().map((s) => (s.id === id ? { ...s, feeling } : s)));
}

/** Local calendar day, e.g. "2026-10-17". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function completedToday(sessions: SessionRecord[], now = new Date()): Set<RoutineId> {
  const today = dayKey(now);
  return new Set(sessions.filter((s) => dayKey(new Date(s.finishedAt)) === today).map((s) => s.routineId));
}

/** Consecutive days with at least one routine done, ending today (or
 * yesterday, so the streak isn't shown as broken before today's exercise). */
export function streak(sessions: SessionRecord[], now = new Date()): number {
  const days = new Set(sessions.map((s) => dayKey(new Date(s.finishedAt))));
  const d = new Date(now);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function todayTotalMs(sessions: SessionRecord[], now = new Date()): number {
  const today = dayKey(now);
  return sessions.filter((s) => dayKey(new Date(s.finishedAt)) === today).reduce((sum, s) => sum + s.durationMs, 0);
}
