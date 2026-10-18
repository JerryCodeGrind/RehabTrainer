// Server-only: who a request belongs to.
import { auth } from "@/auth";
import { isUserId } from "./server";

/** The signed-in account ("google:<sub>") if there is one, else the anonymous
 * device UUID the client sent, else null. Clients can't claim an account id:
 * only UUIDs are accepted from the body. */
export async function resolveUserId(claimed: unknown): Promise<string | null> {
  const session = await auth().catch(() => null); // Auth not configured: stay anonymous.
  if (session?.user?.id) return session.user.id;
  return isUserId(claimed) ? claimed : null;
}
