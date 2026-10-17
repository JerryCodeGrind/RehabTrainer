// Server-only Roboflow helpers. Reads ROBOFLOW_API_KEY from the environment;
// never import this from a client component.
import {
  InferenceHTTPClient,
  WorkflowError,
  type RTCIceServerConfig,
  type WebRTCOffer,
  type WebRTCWorkerResponse,
} from "@roboflow/inference-sdk";
import {
  MONSTERS_WORKFLOW,
  parseMonsterPredictions,
  type MonsterFrame,
} from "./monsters";

const SERVERLESS_URL = "https://serverless.roboflow.com";
const REQUEST_TIMEOUT_MS = 20_000;
const RETRIES = 2;

export class RoboflowError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "RoboflowError";
    this.status = status;
    this.details = details;
  }
}

function getApiKey(): string {
  const key = process.env.ROBOFLOW_API_KEY;
  if (!key) {
    throw new RoboflowError(
      "ROBOFLOW_API_KEY is not set. Add it to .env.local (see README).",
      500,
    );
  }
  return key;
}

const isTransient = (status: number) => status === 429 || status >= 500;

function isRetryable(err: unknown): boolean {
  if (err instanceof RoboflowError || err instanceof WorkflowError) {
    return isTransient(err instanceof RoboflowError ? err.status : err.statusCode);
  }
  return true; // network failure or timeout
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      if (attempt >= RETRIES || !isRetryable(err)) throw err;
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new RoboflowError(`${label} timed out`, 504)),
      REQUEST_TIMEOUT_MS,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export type MonsterImageInput =
  | { type: "base64"; value: string }
  | { type: "url"; value: string };

/**
 * Run the Monsters workflow once on a single image over HTTP.
 * Used for still-image checks and the smoke test; live play uses
 * startMonsterStream.
 */
export async function detectMonsters(image: MonsterImageInput): Promise<MonsterFrame> {
  const apiKey = getApiKey();
  const url = `${SERVERLESS_URL}/${MONSTERS_WORKFLOW.workspaceName}/workflows/${MONSTERS_WORKFLOW.workflowId}`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ inputs: { [MONSTERS_WORKFLOW.imageInputName]: image } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        (body as { message?: unknown } | null)?.message ?? `HTTP ${res.status}`;
      throw new RoboflowError(`Monsters workflow failed: ${message}`, res.status, body);
    }
    // One entry per input image, keyed by the workflow's output names.
    const first = (body as { outputs?: Record<string, unknown>[] } | null)?.outputs?.[0];
    if (!first || !(MONSTERS_WORKFLOW.predictionsOutput in first)) {
      throw new RoboflowError("Monsters workflow returned no predictions output", 502, body);
    }
    return parseMonsterPredictions(first[MONSTERS_WORKFLOW.predictionsOutput]);
  });
}

/**
 * Start a live WebRTC inference session for the browser's SDP offer.
 * The workflow, input and outputs are pinned here so a client can't use
 * this proxy (and our API key) to run anything else.
 */
export async function startMonsterStream(
  offer: WebRTCOffer,
  options: { iceServers?: RTCIceServerConfig[]; processingTimeout?: number } = {},
): Promise<WebRTCWorkerResponse> {
  const client = InferenceHTTPClient.init({ apiKey: getApiKey() });
  return withRetry(() =>
    withTimeout(
      client.initializeWebrtcWorker({
        offer,
        workspaceName: MONSTERS_WORKFLOW.workspaceName,
        workflowId: MONSTERS_WORKFLOW.workflowId,
        config: {
          imageInputName: MONSTERS_WORKFLOW.imageInputName,
          // The workflow has no image outputs; we draw boxes on the local video.
          streamOutputNames: [],
          dataOutputNames: [MONSTERS_WORKFLOW.predictionsOutput],
          iceServers: options.iceServers,
          processingTimeout: options.processingTimeout,
        },
      }),
      "WebRTC session start",
    ),
  );
}

/** TURN servers so players behind strict NATs can still connect. */
export async function getTurnServers(): Promise<RTCIceServerConfig[] | null> {
  const client = InferenceHTTPClient.init({ apiKey: getApiKey() });
  return withRetry(() => withTimeout(client.fetchTurnConfig(), "TURN config fetch"));
}

/** Convert any error from this module into a JSON response for route handlers. */
export function roboflowErrorResponse(err: unknown): Response {
  if (err instanceof WorkflowError) {
    // The SDK's proxy connector turns this body back into a WorkflowError.
    return Response.json(err.errorData, { status: err.statusCode });
  }
  if (err instanceof RoboflowError) {
    return Response.json({ message: err.message }, { status: err.status });
  }
  console.error("[roboflow]", err);
  return Response.json({ message: "Roboflow request failed" }, { status: 502 });
}
