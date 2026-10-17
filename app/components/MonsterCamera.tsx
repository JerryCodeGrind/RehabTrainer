"use client";

import { useState, type RefObject } from "react";
import type { MonsterFrame } from "@/lib/roboflow/monsters";

interface MonsterCameraProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  frame: MonsterFrame | null;
}

/** Full-screen mirrored webcam view with the latest detections drawn on top. */
export function MonsterCamera({ videoRef, frame }: MonsterCameraProps) {
  const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
  const aspect = videoSize ? videoSize.width / videoSize.height : 16 / 9;

  // Boxes are in pixels of the frame the model saw, which the SDK may have
  // downscaled, so position them as percentages of that frame.
  const frameWidth = frame?.imageWidth ?? videoSize?.width;
  const frameHeight = frame?.imageHeight ?? videoSize?.height;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black" style={{ containerType: "size" }}>
      {/* Sized like object-cover (fills the screen, crops the overflow) so the
          boxes stay aligned with the video underneath. */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -scale-x-100"
        style={{ aspectRatio: aspect, width: `max(100cqw, ${100 * aspect}cqh)` }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full"
          onLoadedMetadata={(e) =>
            setVideoSize({
              width: e.currentTarget.videoWidth,
              height: e.currentTarget.videoHeight,
            })
          }
        />
        {frame && frameWidth && frameHeight
          ? frame.detections.map((d) => (
              <div
                key={d.id}
                className="absolute rounded-lg border-4 border-lime-400"
                style={{
                  left: `${((d.x - d.width / 2) / frameWidth) * 100}%`,
                  top: `${((d.y - d.height / 2) / frameHeight) * 100}%`,
                  width: `${(d.width / frameWidth) * 100}%`,
                  height: `${(d.height / frameHeight) * 100}%`,
                }}
              >
                {/* Un-mirror the label so it stays readable. */}
                <span className="absolute -top-9 right-0 -scale-x-100 whitespace-nowrap rounded-md bg-lime-400 px-2 py-1 text-base font-semibold text-black">
                  {d.label.replace(/_/g, " ")} {Math.round(d.confidence * 100)}%
                </span>
              </div>
            ))
          : null}
      </div>
    </div>
  );
}
