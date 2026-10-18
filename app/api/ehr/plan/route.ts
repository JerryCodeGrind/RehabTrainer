import { getDb } from "@/lib/db/server";
import { resolveUserId } from "@/lib/db/user";
import { choosePlan, EhrError, MAX_PDF_BYTES, pdfText } from "@/lib/ehr/server";

// Takes the health record PDF as multipart form field "file" (plus "userId",
// which a signed-in account overrides)
// and returns today's exercise plan (PlanChoice) with the `planId` it was saved
// under, or null if the database is unavailable. The record itself is not stored.
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ message: "Choose a PDF file to upload." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ message: "That isn't a PDF. Upload your health record as a PDF file." }, { status: 415 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return Response.json({ message: "That PDF is too large (over 10 MB)." }, { status: 413 });
  }

  try {
    const text = await pdfText(await file.arrayBuffer());
    if (text.length < 20) {
      throw new EhrError(
        "Couldn't find any text in that PDF. It may be a scanned image; upload a PDF with selectable text.",
        422,
      );
    }
    const plan = await choosePlan(text);
    let planId: string | null = null;
    const userId = await resolveUserId(form?.get("userId"));
    if (userId) {
      try {
        const db = await getDb();
        planId = (await db.collection("plans").insertOne({ userId, createdAt: new Date(), ...plan })).insertedId.toHexString();
      } catch (err) {
        console.error("[db] plan not saved:", err instanceof Error ? err.message : err);
      }
    }
    return Response.json({ ...plan, planId });
  } catch (err) {
    if (err instanceof EhrError) return Response.json({ message: err.message }, { status: err.status });
    console.error("[ehr]", err);
    return Response.json({ message: "Something went wrong reading your record." }, { status: 500 });
  }
}
