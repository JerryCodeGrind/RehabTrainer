import { dbErrorResponse, getDb } from "@/lib/db/server";
import { resolveUserId } from "@/lib/db/user";

const REASONS = ["on-floor", "out-of-frame"];

// Records a fall alarm in `falls`. Body: { userId, reason }; a signed-in account overrides userId.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { userId?: unknown; reason?: unknown } | null;
  const userId = await resolveUserId(body?.userId);
  if (!userId || !body) return Response.json({ message: "Invalid fall" }, { status: 400 });
  try {
    const db = await getDb();
    await db.collection("falls").insertOne({
      userId,
      at: new Date(),
      reason: REASONS.includes(body.reason as string) ? body.reason : null,
    });
    return Response.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
