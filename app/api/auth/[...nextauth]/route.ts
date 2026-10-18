import NextAuth from "next-auth";
import { authOptions, googleConfigured } from "@/lib/auth";

// Without Google credentials and NEXTAUTH_SECRET there's nothing to sign in
// with; answer "no session" instead of letting NextAuth fail on every request.
const handler = googleConfigured() ? NextAuth(authOptions) : () => Response.json({});

export { handler as GET, handler as POST };
