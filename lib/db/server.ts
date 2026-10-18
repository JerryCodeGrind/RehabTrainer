// Server-only MongoDB access. Reads MONGODB_URI and MONGODB_DB (default "rehab")
// from the environment (.env.local); never import this from a client component.
//
// Collections:
//   sessions  one document per finished exercise (raw numbers in `data`)
//   plans     the exercises ChatGPT chose from a health record (never the record itself)
//   falls     one document per fall alarm
import { MongoClient, type Db } from "mongodb";

// One connection per server process, kept on globalThis so dev hot reloads reuse it.
const cache = globalThis as unknown as { rehabDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return Promise.reject(new Error("MONGODB_URI is not set in .env.local."));
  cache.rehabDb ??= connect(uri).catch((err) => {
    cache.rehabDb = undefined; // Try again on the next request.
    throw err;
  });
  return cache.rehabDb;
}

async function connect(uri: string): Promise<Db> {
  const client = await new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 }).connect();
  const db = client.db(process.env.MONGODB_DB?.trim() || "rehab");
  await Promise.all([
    db.collection("sessions").createIndexes([
      { key: { clientId: 1 }, unique: true },
      { key: { userId: 1, finishedAt: -1 } },
      { key: { userId: 1, routineId: 1, finishedAt: -1 } },
    ]),
    db.collection("plans").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("falls").createIndex({ userId: 1, at: -1 }),
  ]);
  return db;
}

/** For route handlers: the app keeps working without the database, so clients just log this. */
export function dbErrorResponse(err: unknown): Response {
  console.error("[db]", err instanceof Error ? err.message : err);
  return Response.json({ message: "Database unavailable" }, { status: 503 });
}

/** Users are anonymous per-device UUIDs (see lib/rehab/sync.ts). */
export function isUserId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
