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
  /** Made-up history from `npm run seed:demo`, for demos. */
  demo?: boolean;
  /** Whose set this is: the account id ("google:<sub>"), or "device" without sign-in. */
  owner?: string;
  /** MongoDB has confirmed this version of the record. Unsynced ones are retried on load. */
  synced?: boolean;
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

/** MongoDB confirmed this record. */
export function markSynced(id: string) {
  write(read().map((s) => (s.id === id ? { ...s, synced: true } : s)));
}

/**
 * Make MongoDB the source of truth for `owner`'s history: their copy on this
 * device becomes exactly what the server has, plus their sets that haven't
 * reached it yet (returned, to retry). Sets saved on this device before sets
 * had owners are adopted by this account. Other accounts' sets are left alone.
 */
export function replaceAccountHistory(owner: string, fromServer: SessionRecord[]): SessionRecord[] {
  const local = read().map((s) => (s.owner ? s : { ...s, owner, synced: false }));
  const server = fromServer.map((s) => ({ ...s, owner, synced: true }));
  const onServer = new Set(server.map((s) => s.id));
  const pending = local.filter((s) => s.owner === owner && !s.synced && !onServer.has(s.id));
  const others = local.filter((s) => s.owner !== owner);
  write([...others, ...server, ...pending].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)));
  return pending;
}

export function setFeeling(id: string, feeling: Feeling) {
  // Changed since MongoDB last confirmed it, until the update is saved there.
  write(read().map((s) => (s.id === id ? { ...s, feeling, synced: false } : s)));
}

/** Local calendar day, e.g. "2026-10-17". */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Routines finished today: a set that reached its target. A set saved partway
 * (stopped early) still counts toward history and streaks, but not here. */
export function completedToday(sessions: SessionRecord[], now = new Date()): Set<RoutineId> {
  const today = dayKey(now);
  return new Set(
    sessions.filter((s) => dayKey(new Date(s.finishedAt)) === today && s.reps >= s.target).map((s) => s.routineId),
  );
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
