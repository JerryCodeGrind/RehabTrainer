// Sends records to the server's MongoDB routes in the background. The app works
// the same without a database: sessions and the plan also stay in localStorage.

import type { FallReason } from "../fall/detector";
import type { SessionRecord } from "./storage";

const USER_KEY = "rehab.userId";
let memoryId: string | undefined;

/** An anonymous ID for this device, made on first use (the app has no sign-in). */
export function userId(): string {
  try {
    let id = localStorage.getItem(USER_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(USER_KEY, id);
    }
    return id;
  } catch {
    return (memoryId ??= crypto.randomUUID());
  }
}

function post(path: string, body: unknown) {
  void fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  })
    .then((res) => {
      if (!res.ok) console.warn(`[sync] ${path}: HTTP ${res.status}`);
    })
    .catch((err) => console.warn(`[sync] ${path}`, err));
}

/** Save a finished exercise; sending it again (e.g. with a feeling) updates the same document. */
export function syncSession(record: SessionRecord, planId: string | null | undefined) {
  post("/api/sessions", { userId: userId(), planId: planId ?? null, record });
}

export function syncFall(reason: FallReason | null) {
  post("/api/falls", { userId: userId(), reason });
}

/** After sign-in: move what this device saved anonymously onto the account. Safe to repeat. */
export function claimAnonymousData() {
  post("/api/account/claim", { anonId: userId() });
}
