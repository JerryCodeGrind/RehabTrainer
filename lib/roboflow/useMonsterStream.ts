"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MONSTERS_WORKFLOW, parseMonsterPredictions, type MonsterFrame } from "./monsters";

type Connection = Awaited<
  ReturnType<(typeof import("@roboflow/inference-sdk"))["webrtc"]["useStream"]>
>;

export type MonsterStreamStatus = "idle" | "starting" | "live" | "error";

/**
 * Streams the webcam to the Monsters workflow over WebRTC and exposes the
 * latest detections. Signaling goes through our /api/roboflow proxy so the
 * API key never reaches the browser.
 */
export function useMonsterStream() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<Connection | null>(null);
  // Bumped on every start/stop so a slow start can tell it was cancelled.
  const sessionRef = useRef(0);
  const [status, setStatus] = useState<MonsterStreamStatus>("idle");
  const [frame, setFrame] = useState<MonsterFrame | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(() => {
    sessionRef.current++;
    const connection = connectionRef.current;
    connectionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    // cleanup() also stops the camera tracks.
    void connection?.cleanup().catch((err) => console.warn("[monsters] cleanup", err));
  }, []);

  const stop = useCallback(() => {
    teardown();
    setFrame(null);
    setStatus("idle");
  }, [teardown]);

  const start = useCallback(async () => {
    teardown();
    const session = sessionRef.current;
    setStatus("starting");
    setError(null);

    let camera: MediaStream | undefined;
    try {
      // Loaded on demand: the SDK touches browser-only WebRTC APIs.
      const { connectors, streams, webrtc } = await import("@roboflow/inference-sdk");
      camera = await streams.useCamera({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      if (session !== sessionRef.current) return streams.stopStream(camera);
      if (videoRef.current) videoRef.current.srcObject = camera;

      const connection = await webrtc.useStream({
        source: camera,
        connector: connectors.withProxyUrl("/api/roboflow/webrtc", {
          turnConfigUrl: "/api/roboflow/turn",
        }),
        // The proxy pins the workflow; these are sent for the SDK's own checks.
        wrtcParams: {
          workspaceName: MONSTERS_WORKFLOW.workspaceName,
          workflowId: MONSTERS_WORKFLOW.workflowId,
          imageInputName: MONSTERS_WORKFLOW.imageInputName,
          dataOutputNames: [MONSTERS_WORKFLOW.predictionsOutput],
        },
        onData: (data) => {
          if (data.errors?.length) console.warn("[monsters] workflow errors", data.errors);
          const output = data.serialized_output_data?.[MONSTERS_WORKFLOW.predictionsOutput];
          if (output !== undefined) setFrame(parseMonsterPredictions(output));
        },
      });
      if (session !== sessionRef.current) {
        await connection.cleanup();
        return;
      }
      connectionRef.current = connection;
      setStatus("live");
    } catch (err) {
      camera?.getTracks().forEach((t) => t.stop());
      if (session !== sessionRef.current) return;
      if (videoRef.current) videoRef.current.srcObject = null;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [teardown]);

  useEffect(() => teardown, [teardown]);

  return { videoRef, status, frame, error, start, stop };
}
