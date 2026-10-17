// Shared (client + server) config, types and parsing for the Roboflow
// "White Monster" workflow (RF-DETR small), which detects Monster Energy cans
// as a single class, `monster_can`.
// Keep this file free of runtime imports so it can be loaded by the smoke test
// under Node's type stripping.

export const MONSTERS_WORKFLOW = {
  workspaceName: "eureka-qanyp",
  workflowId: "white-monster-vwhite-monster-1-rfdetr-small-t1-logic",
  imageInputName: "image",
  // The workflow's only output. Its value is
  // { image: { width, height }, predictions: RawPrediction[] }.
  predictionsOutput: "predictions",
} as const;

export interface MonsterDetection {
  id: string;
  label: string;
  classId: number;
  confidence: number;
  // Box center and size, in pixels of the frame the model saw.
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MonsterFrame {
  // Size of the frame the model saw; null if the server omitted it.
  imageWidth: number | null;
  imageHeight: number | null;
  detections: MonsterDetection[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

function parseDetection(raw: unknown, index: number): MonsterDetection | null {
  if (!isRecord(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const width = num(raw.width);
  const height = num(raw.height);
  if (x === null || y === null || width === null || height === null) return null;
  return {
    id: typeof raw.detection_id === "string" ? raw.detection_id : String(index),
    label: typeof raw.class === "string" ? raw.class : "Monster",
    classId: num(raw.class_id) ?? -1,
    confidence: num(raw.confidence) ?? 0,
    x,
    y,
    width,
    height,
  };
}

/**
 * Parse the workflow's `predictions` output value. Accepts the serialized
 * detections object (HTTP and WebRTC) or a bare predictions array; anything
 * unrecognised yields an empty frame instead of throwing.
 */
export function parseMonsterPredictions(output: unknown): MonsterFrame {
  const image = isRecord(output) && isRecord(output.image) ? output.image : null;
  const rawList = Array.isArray(output)
    ? output
    : isRecord(output) && Array.isArray(output.predictions)
      ? output.predictions
      : [];
  return {
    imageWidth: num(image?.width),
    imageHeight: num(image?.height),
    detections: rawList
      .map(parseDetection)
      .filter((d): d is MonsterDetection => d !== null),
  };
}
