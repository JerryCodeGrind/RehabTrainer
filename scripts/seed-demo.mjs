// Seeds a few weeks of made-up exercise history for one account, so the
// progress screens have something to show in a demo.
//   npm run seed:demo -- --email you@gmail.com            (28 days, up to yesterday)
//   npm run seed:demo -- --email you@gmail.com --days 45
//   npm run seed:demo -- --email you@gmail.com --clear    (removes only the demo sessions)
// Needs MONGODB_URI in .env.local, and the account must have signed in once.
// Every seeded session is tagged `demo: true`; re-running replaces the old demo
// data, and real sessions are never touched. The app loads them on next sign-in
// or page load (see syncAccount in lib/rehab/sync.ts).
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import { parseArgs } from "node:util";

// Let Node resolve the extensionless relative imports used in lib/ (as Next does).
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, next) {
        if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
          try { return await next(specifier + ".ts", context); } catch {}
        }
        return next(specifier, context);
      }`),
);

const { MongoClient } = await import("mongodb");
const { ROUTINE_ORDER, createRoutine } = await import("../lib/rehab/routines/index.ts");
const { SETTINGS } = await import("../lib/rehab/settings.ts");

const { values: args } = parseArgs({
  options: {
    email: { type: "string" },
    days: { type: "string", default: "28" },
    clear: { type: "boolean", default: false },
  },
});
if (!args.email) {
  console.error("Usage: npm run seed:demo -- --email you@gmail.com [--days 28] [--clear]");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set (add it to .env.local).");
  process.exit(1);
}
const days = Math.max(1, Math.min(120, Number(args.days) || 28));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const shuffle = (xs) => xs.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);

/** Plausible sessions: most days active, 2-4 exercises a day, reps creeping up toward the target. */
function makeSessions(userId, planId, routines) {
  const docs = [];
  const today = new Date();
  // Up to yesterday, so today's real sessions stand on their own.
  for (let back = days; back >= 1; back--) {
    if (Math.random() < 0.25) continue; // rest day
    const progress = 1 - back / days; // 0 at the start of the period, ~1 by yesterday
    const hardDay = Math.random() < 0.12;
    const count = Math.min(routines.length, 2 + Math.floor(Math.random() * 3));
    const clock = new Date(today);
    clock.setDate(today.getDate() - back);
    clock.setHours(Math.random() < 0.6 ? 9 : 17, Math.floor(Math.random() * 50), 0, 0);

    for (const routineId of shuffle(routines).slice(0, count)) {
      const target = createRoutine(routineId, SETTINGS).getSummary().target;
      if (!(target > 0)) continue;
      const completion = clamp(0.45 + 0.5 * progress + (Math.random() - 0.5) * 0.15 - (hardDay ? 0.2 : 0), 0.2, 1);
      const reps = Math.max(1, Math.round(target * completion));
      const durationMs = Math.round((40 + target * 4 * (1.2 - 0.3 * progress) + Math.random() * 20) * 1000);
      const startedAt = new Date(clock);
      const finishedAt = new Date(clock.getTime() + durationMs);
      clock.setTime(finishedAt.getTime() + (60 + Math.random() * 120) * 1000);
      docs.push({
        clientId: `demo-${randomUUID()}`,
        userId,
        planId,
        routineId,
        startedAt,
        finishedAt,
        durationMs,
        reps,
        target,
        completion: Math.min(1, reps / target),
        feeling: hardDay ? "hard" : reps >= target ? (Math.random() < 0.5 ? "easy" : "right") : "right",
        metrics: [],
        data: {},
        demo: true,
      });
    }
  }
  return docs;
}

const client = await new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 }).connect();
try {
  const db = client.db(process.env.MONGODB_DB?.trim() || "rehab");
  const user = await db.collection("users").findOne({ email: args.email });
  if (!user) {
    throw new Error(`No account with email ${args.email}. Sign in to the app once with that Google account first.`);
  }
  const userId = user._id;
  const sessions = db.collection("sessions");
  const { deletedCount } = await sessions.deleteMany({ userId, demo: true });

  if (args.clear) {
    console.log(`Removed ${deletedCount} demo sessions for ${args.email}. Real sessions were not touched.`);
  } else {
    // The account's latest plan if it has one, otherwise the first five exercises.
    const plan = await db.collection("plans").findOne({ userId }, { sort: { createdAt: -1 } });
    const routines = (plan?.routines?.length ? plan.routines : ROUTINE_ORDER.slice(0, 5)).filter((id) =>
      ROUTINE_ORDER.includes(id),
    );
    const docs = makeSessions(userId, plan?._id ?? null, routines);
    if (docs.length) await sessions.insertMany(docs);
    const activeDays = new Set(docs.map((d) => d.finishedAt.toDateString())).size;
    console.log(
      `Seeded ${docs.length} demo sessions over ${activeDays} of the last ${days} days for ${args.email}` +
        ` (${routines.join(", ")})${deletedCount ? `, replacing ${deletedCount} older demo sessions` : ""}.`,
    );
    console.log("Reload the app while signed in to see them. Remove them with --clear.");
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.close();
}
