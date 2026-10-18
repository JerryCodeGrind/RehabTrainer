// Small per-device flags in localStorage, exposed as an external store for
// useSyncExternalStore like plan.ts. Nothing here is health information.

export interface Prefs {
  /** Using the app on this device without an account (only offered while Google sign-in isn't configured). */
  deviceOnly: boolean;
}

const KEY = "rehab.prefs.v1";
const DEFAULTS: Prefs = { deviceOnly: false };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: Prefs } | null = null;

function read(): Prefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache?.value ?? DEFAULTS;
  }
  if (cache && cache.raw === raw) return cache.value;
  let value = DEFAULTS;
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") value = { ...DEFAULTS, ...parsed };
  } catch {
    // Corrupt: fall back to defaults.
  }
  cache = { raw, value };
  return value;
}

export function setPrefs(patch: Partial<Prefs>) {
  const value = { ...read(), ...patch };
  const raw = JSON.stringify(value);
  cache = { raw, value };
  try {
    localStorage.setItem(KEY, raw);
  } catch {
    // Storage blocked: keep the in-memory copy for this visit.
  }
  listeners.forEach((l) => l());
}

export const prefsStore = {
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
  getServerSnapshot: () => DEFAULTS,
};
