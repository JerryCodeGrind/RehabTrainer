"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/** Loads the session in the browser, so pages stay static (no cookie reads while rendering). */
export function AuthProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
