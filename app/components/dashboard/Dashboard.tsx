"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { claimAnonymousData } from "@/lib/rehab/sync";
import RehabApp from "../rehab/RehabApp";

/** Signed-in area: sends anyone not signed in back to the landing page. */
export function Dashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const accountId = session?.user?.id;

  // Once per account per visit, move anything saved anonymously on this device onto the account.
  const claimed = useRef<string | null>(null);
  useEffect(() => {
    if (accountId && claimed.current !== accountId) {
      claimed.current = accountId;
      claimAnonymousData();
    }
  }, [accountId]);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/");
  }, [status, router]);

  if (status !== "authenticated") {
    return <p className="m-auto p-8 text-2xl text-zinc-400">Loading…</p>;
  }
  return <RehabApp />;
}
