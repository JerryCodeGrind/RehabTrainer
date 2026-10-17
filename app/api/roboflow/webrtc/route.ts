import type { RTCIceServerConfig } from "@roboflow/inference-sdk";
import { roboflowErrorResponse, startMonsterStream } from "@/lib/roboflow/server";

// Signaling proxy for connectors.withProxyUrl(): the SDK POSTs
// { offer, wrtcParams } and expects the server's SDP answer back.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    offer?: { sdp?: unknown; type?: unknown };
    wrtcParams?: { iceServers?: unknown };
  } | null;

  const offer = body?.offer;
  if (typeof offer?.sdp !== "string" || offer.type !== "offer") {
    return Response.json({ message: "Expected a WebRTC offer" }, { status: 400 });
  }
  // Only the ICE servers are taken from the client; the workflow is pinned server-side.
  const iceServers = Array.isArray(body?.wrtcParams?.iceServers)
    ? (body.wrtcParams.iceServers as RTCIceServerConfig[])
    : undefined;

  try {
    const answer = await startMonsterStream({ sdp: offer.sdp, type: offer.type }, { iceServers });
    return Response.json(answer);
  } catch (err) {
    return roboflowErrorResponse(err);
  }
}
