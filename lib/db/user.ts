// Server-only: who a request belongs to.
import { getServerSession } from "next-auth";
import { authOptions, googleConfigured } from "@/lib/auth";
import { isUserId } from "./server";

/** The signed-in account ("google:<sub>") if there is one, else the anonymous
 * device UUID the client sent, else null. Clients can't claim an account id:
 * only UUIDs are accepted from the body. */
export async function resolveUserId(claimed: unknown): Promise<string | null> {
  const id = await accountId();
  if (id) return id;
  return isUserId(claimed) ? claimed : null;
}

/** The signed-in account's id ("google:<sub>"), or null when signed out or sign-in isn't configured. */
export async function accountId(): Promise<string | null> {
  if (!googleConfigured()) return null;
  const session = await getServerSession(authOptions).catch(() => null);
  const id = (session?.user as { id?: string } | undefined)?.id;
  return typeof id === "string" ? id : null;
}
