// Sends records to the server's MongoDB routes in the background. The app works
// the same without a database: sessions and the plan also stay in localStorage.

import type { FallReason } from "../fall/detector";
import { markSynced, replaceAccountHistory, type SessionRecord } from "./storage";

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
/** Save a finished set to MongoDB; once it confirms, the set is marked synced. */
export function syncSession(record: SessionRecord, planId: string | null | undefined) {
  // The server keeps only the fields it knows, so local bookkeeping (owner, synced) is ignored.
  void fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId(), planId: planId ?? null, record }),
    keepalive: true,
  })
    .then((res) => {
      if (res.ok) markSynced(record.id);
      else console.warn(`[sync] /api/sessions: HTTP ${res.status}`);
    })
    .catch((err) => console.warn("[sync] /api/sessions", err));
}

export function syncFall(reason: FallReason | null) {
  post("/api/falls", { userId: userId(), reason });
}

/** After sign-in: move what this device saved anonymously onto the account. Safe to repeat. */
/**
 * After sign-in: move this device's anonymous data onto the account, load the
 * account's history from MongoDB (the source of truth: other devices, seeded
 * demo data), and retry any of this account's sets that never reached it.
 */
export async function syncAccount(owner: string) {
  try {
    await fetch("/api/account/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonId: userId() }),
    });
    const res = await fetch("/api/sessions");
    if (!res.ok) return console.warn(`[sync] load history: HTTP ${res.status}`);
    const body = (await res.json()) as { sessions?: SessionRecord[] };
    if (!Array.isArray(body.sessions)) return;
    for (const pending of replaceAccountHistory(owner, body.sessions)) syncSession(pending, null);
  } catch (err) {
    console.warn("[sync] account", err);
  }
}
