import { dbErrorResponse, getDb, isUserId } from "@/lib/db/server";
import { accountId as getAccountId } from "@/lib/db/user";

// After sign-in, moves everything this device saved anonymously onto the
// account, so history follows the user to other devices. Body: { anonId }.
// Safe to repeat: once moved, nothing matches the anonymous id any more.
export async function POST(request: Request) {
  const accountId = await getAccountId();
  if (!accountId) return Response.json({ message: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { anonId?: unknown } | null;
  if (!isUserId(body?.anonId)) return Response.json({ message: "Invalid id" }, { status: 400 });
  const anonId = body.anonId;
  try {
    const db = await getDb();
    const moved = await Promise.all(
      ["sessions", "plans", "falls"].map((name) =>
        db.collection(name).updateMany({ userId: anonId }, { $set: { userId: accountId } }),
      ),
    );
    return Response.json({ ok: true, moved: moved.reduce((n, r) => n + r.modifiedCount, 0) });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
