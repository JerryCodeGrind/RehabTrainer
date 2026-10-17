import { choosePlan, EhrError, MAX_PDF_BYTES, pdfText } from "@/lib/ehr/server";

// Takes the health record PDF as multipart form field "file" and returns
// today's exercise plan (PlanChoice). The record is not stored.
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
    return Response.json(await choosePlan(text));
  } catch (err) {
    if (err instanceof EhrError) return Response.json({ message: err.message }, { status: err.status });
    console.error("[ehr]", err);
    return Response.json({ message: "Something went wrong reading your record." }, { status: 500 });
  }
}
