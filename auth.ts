// Auth.js (next-auth v5) with Google sign-in. Reads AUTH_SECRET, AUTH_GOOGLE_ID
// and AUTH_GOOGLE_SECRET from the environment (.env.local).
//
// Sessions are JWT cookies, so no adapter is needed (@auth/mongodb-adapter
// doesn't support mongodb 7). On sign-in the profile is upserted into the
// `users` collection, keyed by the account's userId, "google:<sub>". That id
// can't collide with the anonymous per-device UUIDs (see lib/db/user.ts).
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/lib/db/server";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
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
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});

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
