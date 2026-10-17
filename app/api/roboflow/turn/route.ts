import { connection } from "next/server";
import { getTurnServers, roboflowErrorResponse } from "@/lib/roboflow/server";

// TURN credentials for connectors.withProxyUrl({ turnConfigUrl }).
export async function GET() {
  // Credentials are short-lived: always fetch at request time, never prerender.
  await connection();
  try {
    return Response.json({ iceServers: await getTurnServers() });
  } catch (err) {
    return roboflowErrorResponse(err);
  }
}
