// Server-only: Google sign-in through NextAuth. Credentials come from
// .env.local (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET); without
// them no provider is registered and the sign-in screen says so.

import type { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET);
}

export const authOptions: AuthOptions = {
  providers: googleConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        }),
      ]
    : [],
  // Sessions live in a signed cookie; no database, and nothing about the
  // user's health is attached to the account.
  session: { strategy: "jwt" },
  // Sign-in and its errors both land on the app's own sign-in screen.
  pages: { signIn: "/", error: "/" },
};
