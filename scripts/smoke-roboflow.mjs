// Smoke test for the Roboflow Monsters workflow integration.
//   npm run smoke:roboflow
// Calls the real serverless workflow, so it needs ROBOFLOW_API_KEY (.env.local).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";

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

const { detectMonsters, startMonsterStream } = await import("../lib/roboflow/server.ts");

// 1. HTTP: run the workflow on a Monster can photo. detectMonsters() itself
// throws if the `predictions` output is missing. The model (68 training
// images) doesn't fire on this stock photo, so only the response shape is
// asserted; swap in a webcam frame of your can to also check recall.
const image = await readFile(new URL("./fixtures/monster-can.jpg", import.meta.url));
const frame = await detectMonsters({ type: "base64", value: image.toString("base64") });
assert.ok(Array.isArray(frame.detections), "detections missing");
for (const d of frame.detections) {
  for (const key of ["label", "classId", "confidence", "x", "y", "width", "height"]) {
    assert.ok(key in d, `detection missing ${key}`);
  }
}
const top = frame.detections[0];
console.log(
  top
    ? `ok - HTTP: ${frame.detections.length} detection(s), top "${top.label}" @ ${top.confidence.toFixed(2)}`
    : "ok - HTTP: workflow responded (0 detections on the fixture)",
);

// 2. WebRTC signaling: the workflow accepts a session for a (synthetic) offer.
// The offer can never connect, so the server-side session times out on its own.
const fingerprint = Array(32).fill("AB").join(":");
const media = (kind, mid, extra) => [
  kind, "c=IN IP4 0.0.0.0",
  "a=ice-ufrag:smoke", "a=ice-pwd:smoketestsmoketestsmoke",
  `a=fingerprint:sha-256 ${fingerprint}`, "a=setup:actpass", `a=mid:${mid}`, ...extra,
];
const sdp = [
  "v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0 1",
  ...media("m=video 9 UDP/TLS/RTP/SAVPF 96", 0, ["a=sendrecv", "a=rtcp-mux", "a=rtpmap:96 VP8/90000"]),
  ...media("m=application 9 UDP/DTLS/SCTP webrtc-datachannel", 1, ["a=sctp-port:5000"]),
  "",
].join("\r\n");
const answer = await startMonsterStream({ sdp, type: "offer" }, { processingTimeout: 30 });
assert.equal(answer.type, "answer");
assert.ok(answer.sdp, "answer missing SDP");
console.log("ok - WebRTC: session accepted");
