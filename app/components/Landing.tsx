"use client";

import { IconActivityHeartbeat } from "@tabler/icons-react";
import { motion, type Variants } from "framer-motion";
import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

// Each item fades in and rises, one after another.
const stagger: Variants = { animate: { transition: { staggerChildren: 0.1 } } };
const fadeInUp: Variants = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };
const transition = { duration: 0.5, ease: "easeOut" } as const;
// The call-to-action grows a little on hover and presses in on click.
const press = { whileHover: { scale: 1.05 }, whileTap: { scale: 0.95 } };

const BUTTON =
  "inline-flex min-h-16 items-center justify-center rounded-full bg-lime-400 px-10 text-2xl font-bold text-black shadow-lg transition-[background-color,box-shadow] duration-200 hover:bg-lime-300 hover:shadow-xl hover:shadow-lime-400/20 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-50";

/** Placeholder landing page: what the app is, and sign in. */
export function Landing() {
  const { status } = useSession();
  return (
    <motion.main
      variants={stagger}
      initial="initial"
      animate="animate"
      className="flex flex-1 flex-col items-center justify-center gap-8 bg-zinc-950 px-6 py-16 text-center text-white"
    >
      <motion.div variants={fadeInUp} transition={transition}>
        <IconActivityHeartbeat size={72} className="text-lime-400" aria-hidden />
      </motion.div>
      <motion.h1 variants={fadeInUp} transition={transition} className="text-5xl font-bold tracking-tight sm:text-6xl">
        Home Rehab
      </motion.h1>
      <motion.p variants={fadeInUp} transition={transition} className="max-w-xl text-2xl text-zinc-300">
        Rehab exercises at home, chosen from your health record, with your camera counting every rep and watching
        for falls.
      </motion.p>
      <motion.div variants={fadeInUp} transition={transition}>
        {status === "authenticated" ? (
          <motion.div {...press} className="inline-block">
            <Link href="/dashboard" className={BUTTON}>
              Open dashboard
            </Link>
          </motion.div>
        ) : (
          <motion.button
            {...press}
            onClick={() => signIn("google", { redirectTo: "/dashboard" })}
            disabled={status === "loading"}
            className={BUTTON}
          >
            Sign in with Google
          </motion.button>
        )}
      </motion.div>
    </motion.main>
  );
}
