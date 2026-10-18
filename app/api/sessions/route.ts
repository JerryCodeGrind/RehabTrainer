import { ObjectId } from "mongodb";
import { dbErrorResponse, getDb } from "@/lib/db/server";
import { resolveUserId } from "@/lib/db/user";
import { ROUTINE_ORDER } from "@/lib/rehab/routines/index";
import type { SessionRecord } from "@/lib/rehab/storage";

// A session's raw numbers are a few KB at most; refuse anything far bigger.
const MAX_BODY_CHARS = 64 * 1024;
const FEELINGS = ["easy", "right", "hard"];

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

// Saves a finished exercise to `sessions`, keyed by the record's own id, so
// sending it again (after the user says how it felt) updates the same document.
// Body: { userId, planId, record: SessionRecord }; a signed-in account overrides userId.
export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return Response.json({ message: "Too large" }, { status: 413 });
  let body: { userId?: unknown; planId?: unknown; record?: Partial<SessionRecord> } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Handled below.
  }
  const r = body?.record;
  const userId = await resolveUserId(body?.userId);
  if (
    !userId ||
    !body ||
    !r ||
    typeof r.id !== "string" ||
    !ROUTINE_ORDER.includes(r.routineId!) ||
    !isNum(r.reps) ||
    !isNum(r.target) ||
    !isNum(r.durationMs) ||
    !isDate(r.startedAt) ||
    !isDate(r.finishedAt)
  ) {
    return Response.json({ message: "Invalid session" }, { status: 400 });
  }

  const doc = {
    clientId: r.id,
    userId,
    planId: typeof body.planId === "string" && /^[0-9a-f]{24}$/.test(body.planId) ? new ObjectId(body.planId) : null,
    routineId: r.routineId,
    startedAt: new Date(r.startedAt),
    finishedAt: new Date(r.finishedAt),
    durationMs: r.durationMs,
    reps: r.reps,
    target: r.target,
    completion: r.target > 0 ? Math.min(1, r.reps / r.target) : null,
    feeling: FEELINGS.includes(r.feeling as string) ? r.feeling : null,
    metrics: Array.isArray(r.metrics) ? r.metrics : [],
    data: r.data && typeof r.data === "object" ? r.data : {},
  };
  try {
    const db = await getDb();
    await db.collection("sessions").replaceOne({ clientId: doc.clientId, userId: doc.userId }, doc, { upsert: true });
    return Response.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
