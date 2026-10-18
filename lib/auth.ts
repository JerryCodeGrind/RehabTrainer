// Server-only: Google sign-in through NextAuth. Credentials come from
// .env.local (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET, or the
// Auth.js names AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, AUTH_SECRET); without them
// no provider is registered and the sign-in screen says so.
//
// The session carries the account's userId, "google:<sub>", which MongoDB
// records are saved under (see lib/db/user.ts). It can't collide with the
// anonymous per-device UUIDs used before sign-in.

import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { getDb } from "@/lib/db/server";

const clientId = () => process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;
const secret = () => process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

export function googleConfigured(): boolean {
  return Boolean(clientId() && clientSecret() && secret());
}

export const authOptions: AuthOptions = {
  providers: googleConfigured() ? [GoogleProvider({ clientId: clientId()!, clientSecret: clientSecret()! })] : [],
  secret: secret(),
  // Sessions live in a signed cookie. The account's profile is saved to
  // `users`, but nothing about the user's health is attached to the account.
  session: { strategy: "jwt" },
  // Sign-in and its errors both land on the app's own sign-in screen.
  pages: { signIn: "/", error: "/" },
  callbacks: {
    async jwt({ token, account }) {
      // `account` is only set on the sign-in request itself.
      if (account?.provider === "google") {
        token.userId = `google:${account.providerAccountId}`;
        await saveUser(token.userId as string, token);
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string" && session.user) (session.user as { id?: string }).id = token.userId;
      return session;
    },
  },
};

/** Best effort: signing in still works when the database is down. */
async function saveUser(id: string, profile: { name?: string | null; email?: string | null; picture?: string | null }) {
  try {
    const db = await getDb();
    const now = new Date();
    await db.collection<{ _id: string }>("users").updateOne(
      { _id: id },
      {
        $set: { name: profile.name ?? null, email: profile.email ?? null, image: profile.picture ?? null, lastSignInAt: now },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  } catch (err) {
    console.error("[db] user not saved:", err instanceof Error ? err.message : err);
  }
}
