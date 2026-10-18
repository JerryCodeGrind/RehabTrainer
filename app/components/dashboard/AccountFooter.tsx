"use client";

import { IconLogout, IconUser } from "@tabler/icons-react";
import { signOut, useSession } from "next-auth/react";
import { Label } from "./Sidebar";

/** Sidebar footer: a Sign out row, then the signed-in user's picture and name.
 * Sized for the 64 px rail: 40 px avatar, so footer padding px-3 centers it. */
export function AccountFooter({ open }: { open: boolean }) {
  const { data: session } = useSession();
  const user = session?.user;
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        aria-label="Sign out"
        className="flex h-11 w-full items-center gap-3 rounded-xl px-2.5 text-left text-base font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white focus-visible:outline-2 focus-visible:outline-lime-400"
      >
        <IconLogout size={20} stroke={2} className="shrink-0" aria-hidden />
        <Label show={open}>Sign out</Label>
      </button>
      <div className="flex items-center gap-3 py-1">
        {user?.image ? (
          // Google avatars come from many hosts; a plain <img> avoids configuring next/image for them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-white">
            <IconUser size={22} />
          </span>
        )}
        <Label show={open} className="text-base font-semibold">
          {user?.name ?? "Signed in"}
        </Label>
      </div>
    </div>
  );
}
