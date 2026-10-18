"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, GestureRecognizer, PoseLandmarker } from "@mediapipe/tasks-vision";
import { AutoFramer, toCrop, type Crop, type FramingHint } from "@/lib/rehab/framing";
import {
  gestureScale,
  handCrops,
  raisedHand,
  StartGestureTrigger,
  type GestureState,
  type HandResult,
  type TriggerDebug,
} from "@/lib/rehab/gesture";
import { PoseSmoother, type PoseFrame, type RawLandmark } from "@/lib/rehab/pose";
import { SETTINGS } from "@/lib/rehab/settings";

// Keep the WASM version in sync with @mediapipe/tasks-vision in package.json.
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
// Lite model: fastest of the three pose models, accurate enough for big joints.
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
// MediaPipe's built-in gesture model; "Thumb_Up" is one of its categories.
const GESTURE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const AUTO_FRAME_KEY = "rehab.autoFrame";
const GESTURE_KEY = "rehab.gestureStart";
const IDLE_GESTURE: GestureState = { progress: 0, handVisible: false, fired: false, kind: null };

export type CameraStatus = "off" | "loading" | "ready" | "error";
export type FrameListener = (frame: PoseFrame | null, t: number) => void;
export type GestureListener = (state: GestureState) => void;

/** What the start-gesture checks are doing, for the debug panel. */
export interface GestureDiag {
  /** "running", or why the thumbs-up recognizer isn't. */
  recognizer: string;
  /** "running", or why the raise-hand check isn't. */
  raiseHand: string;
  hands: HandResult[];
  raised: string | null;
  /** The exact images sent to the recognizer this check (unmirrored camera pixels). */
  images: { label: string; canvas: HTMLCanvasElement }[];
  trigger: TriggerDebug;
}
export type GestureDiagListener = (diag: GestureDiag) => void;

/**
 * MediaPipe's WASM prints informational messages ("Created TensorFlow Lite
 * XNNPACK delegate for CPU", "OpenGL error checking is disabled") through
 * console.error / console.warn, which the Next.js dev overlay counts as issues.
 * Drop just those; real errors still go through. Installed once, when a model loads.
 */
function quietMediaPipeLogs() {
  const w = window as unknown as { __rehabQuietLogs?: boolean };
  if (w.__rehabQuietLogs) return;
  w.__rehabQuietLogs = true;
  const noise = /^INFO: |^[IW]\d{4} \d\d:\d\d:\d\d|OpenGL error checking is disabled|XNNPACK delegate/;
  for (const level of ["error", "warn", "info", "log"] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === "string" && noise.test(args[0])) return;
      original.apply(console, args);
    };
  }
}

async function createLandmarker(): Promise<PoseLandmarker> {
  quietMediaPipeLogs();
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch {
    // No WebGL2 / GPU support: fall back to the CPU delegate.
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
}

async function createGestureRecognizer(): Promise<GestureRecognizer> {
  quietMediaPipeLogs();
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  // IMAGE mode: each check sees new crops, so there's no video stream to track across.
  const options = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate }, runningMode: "IMAGE" as const, numHands: 2 });
  try {
    return await GestureRecognizer.createFromOptions(vision, options("GPU"));
  } catch {
    return GestureRecognizer.createFromOptions(vision, options("CPU"));
  }
}

interface RecognizerCanvases {
  left: HTMLCanvasElement;
  right: HTMLCanvasElement;
  full: HTMLCanvasElement;
}

function topOf(result: { gestures: { categoryName: string; score: number }[][] }, i: number) {
  const g = result.gestures[i]?.[0];
  return { top: g?.categoryName ?? null, topScore: g?.score ?? 0 };
}

/**
 * Runs the gesture recognizer once per hand crop (scaled up to at least
 * minCropPx), or once on the downscaled full frame when no wrist is visible.
 * Crops come from the full-resolution, unmirrored video frame.
 */
function recognizeHands(rec: GestureRecognizer, video: HTMLVideoElement, frame: PoseFrame | null, canvases: RecognizerCanvases) {
  const cfg = SETTINGS.gesture;
  const size = { width: video.videoWidth, height: video.videoHeight };
  const crops = handCrops(frame?.draw ?? null, gestureScale(frame, cfg), size, cfg, SETTINGS.pose.minVisibility);
  const hands: HandResult[] = [];
  const images: GestureDiag["images"] = [];

  for (const c of crops) {
    const canvas = canvases[c.side];
    const px = Math.max(cfg.minCropPx, Math.min(512, Math.round(c.size)));
    sizeCanvas(canvas, px, px);
    canvas.getContext("2d")?.drawImage(video, c.x, c.y, c.size, c.size, 0, 0, px, px);
    const result = rec.recognize(canvas);
    const label = `${c.side} hand crop`;
    hands.push({ source: label, detected: result.landmarks.length > 0, ...topOf(result, 0) });
    images.push({ label: `${label} (${Math.round(c.size)} px → ${px})`, canvas });
  }

  if (!crops.length) {
    // No wrists from Pose: look for up to two hands in the whole frame.
    const canvas = canvases.full;
    const w = Math.min(640, size.width);
    sizeCanvas(canvas, w, Math.round((w * size.height) / size.width));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const result = rec.recognize(canvas);
    images.push({ label: "full frame (no wrists visible)", canvas });
    if (!result.landmarks.length) hands.push({ source: "full frame", detected: false, top: null, topScore: 0 });
    result.landmarks.forEach((_, i) => hands.push({ source: `full frame, hand ${i + 1}`, detected: true, ...topOf(result, i) }));
  }
  return { hands, images };
}

/** 1080p if the camera has it (more room to crop), otherwise 720p. */
async function openCamera(): Promise<MediaStream> {
  const { ideal, fallback } = SETTINGS.camera;
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { width: { min: ideal.width }, height: { min: ideal.height }, facingMode: "user" },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") throw err;
    return navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: fallback.width }, height: { ideal: fallback.height }, facingMode: "user" },
    });
  }
}

/** Draws the cropped camera picture and the skeleton, with landmarks mapped
 * through the crop so they line up. The canvas is unmirrored; CSS mirrors it
 * like a selfie view. */
function drawView(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, crop: Crop, frame: PoseFrame | null) {
  const { width: w, height: h } = ctx.canvas;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  ctx.drawImage(video, crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh, 0, 0, w, h);
  if (!frame) return;
  const pts = frame.draw.map((p) => ({ ...toCrop(p, crop), v: p.visibility }));
  const ok = (i: number) => pts[i].v > SETTINGS.pose.minVisibility;
  // Below the tracking threshold but still roughly placed: shown as uncertain, never used for counting.
  const faint = (i: number) => !ok(i) && pts[i].v > SETTINGS.pose.minVisibility * 0.4;
  const scale = Math.max(2, h / 180);
  ctx.lineCap = "round";
  // Face points are skipped to keep the picture clear.
  const bones = PoseLandmarker.POSE_CONNECTIONS.filter(({ start, end }) => start >= 11 && end >= 11 && ok(start) && ok(end));
  const strokeBones = () => {
    for (const { start, end } of bones) {
      ctx.beginPath();
      ctx.moveTo(pts[start].x * w, pts[start].y * h);
      ctx.lineTo(pts[end].x * w, pts[end].y * h);
      ctx.stroke();
    }
  };
  ctx.lineWidth = scale * 2.2;
  ctx.strokeStyle = "rgba(20, 30, 36, 0.55)";
  strokeBones();
  ctx.lineWidth = scale * 0.9;
  ctx.strokeStyle = "#72a1e5";
  strokeBones();
  for (let i = 11; i < pts.length; i++) {
    const x = pts[i].x * w;
    const y = pts[i].y * h;
    if (ok(i)) {
      const r = scale * (MAJOR_JOINTS.has(i) ? 1.9 : 1.1);
      ctx.beginPath();
      ctx.arc(x, y, r + scale * 0.6, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(20, 30, 36, 0.6)";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = MAJOR_JOINTS.has(i) ? "#ffffff" : "#e9edde";
      ctx.fill();
    } else if (faint(i)) {
      ctx.beginPath();
      ctx.arc(x, y, scale * 1.4, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1, scale * 0.45);
      ctx.strokeStyle = "rgba(233, 237, 222, 0.6)";
      ctx.stroke();
    }
  }
}

/** Shoulders, elbows, hips and knees: drawn larger. */
const MAJOR_JOINTS = new Set([11, 12, 13, 14, 23, 24, 25, 26]);

function sizeCanvas(c: HTMLCanvasElement, width: number, height: number) {
  if (c.width !== width || c.height !== height) {
    c.width = width;
    c.height = height;
  }
}

/** A remembered on/off preference for this device. */
function readFlag(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    // Blocked storage: the toggle still works for this visit.
  }
}

/**
 * Owns the one camera stream and pose model for the whole app, plus
 * auto-framing. Video and canvas elements attach through callback refs. The
 * camera is only on during exercises: routine screens call ensureCamera(), and
 * RehabApp calls releaseCamera() on every other screen.
 */
export function usePoseSource() {
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState<string | null>(null);
  const [autoFrame, setAutoFrameState] = useState(() => readFlag(AUTO_FRAME_KEY, SETTINGS.framing.enabledByDefault));
  const [gestureStart, setGestureStartState] = useState(() => readFlag(GESTURE_KEY, SETTINGS.gesture.enabledByDefault));
  // Set if the gesture model can't load; the Start button still works.
  const [gestureError, setGestureError] = useState<string | null>(null);
  // Width / height of the camera frame, so the view can match it (e.g. portrait phones).
  const [aspect, setAspect] = useState(16 / 9);
  const listeners = useRef(new Set<FrameListener>());
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const landmarker = useRef<PoseLandmarker | null>(null);
  const opening = useRef(false);
  // False once releaseCamera() runs, so a camera that finishes opening afterwards is closed again.
  const wanted = useRef(false);
  const framer = useRef(new AutoFramer(SETTINGS.framing, SETTINGS.pose.minVisibility));
  const hint = useRef<FramingHint>({ enabled: autoFrame, fullFrame: false, lock: false });
  const gestureListeners = useRef(new Set<GestureListener>());
  const gestureActive = useRef(false);
  const recognizer = useRef<GestureRecognizer | null>(null);
  const recognizerLoading = useRef(false);
  const trigger = useRef(new StartGestureTrigger(SETTINGS.gesture));
  const gestureOffReason = useRef("not on a routine screen");
  const gestureErrorRef = useRef<string | null>(null);
  const diagListeners = useRef(new Set<GestureDiagListener>());
  // Debug: `[gesture]` console logging, and landmarks injected in place of the
  // pose model's output (camera path) so the real detection path can be tested.
  const gestureLogging = useRef(false);
  const injectedPose = useRef<RawLandmark[] | null>(null);

  const subscribe = useCallback((fn: FrameListener) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  const attachStream = useCallback(() => {
    const v = video.current;
    if (v && stream.current && v.srcObject !== stream.current) {
      v.srcObject = stream.current;
      void v.play().catch(() => {});
    }
  }, []);

  /** Opens the camera and loads the model the first time; later calls do nothing. */
  const ensureCamera = useCallback(async () => {
    wanted.current = true;
    if (opening.current || stream.current) return;
    opening.current = true;
    setStatus("loading");
    setError(null);
    try {
      const [lm, s] = await Promise.all([landmarker.current ?? createLandmarker(), openCamera()]);
      landmarker.current = lm;
      if (!wanted.current) {
        s.getTracks().forEach((t) => t.stop());
        setStatus("off");
        return;
      }
      stream.current = s;
      attachStream();
      setStatus("ready");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission was blocked. Allow camera access in your browser, then try again."
          : err instanceof Error
            ? err.message
            : String(err),
      );
      setStatus("error");
    } finally {
      opening.current = false;
    }
  }, [attachStream]);

  /** Turns the camera off (the light goes out); the pose model stays loaded so
   * the next ensureCamera() is quick. Pose frames stop until then. */
  const releaseCamera = useCallback(() => {
    wanted.current = false;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setStatus((s) => (s === "loading" ? s : "off"));
  }, []);

  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      video.current = el;
      attachStream();
    },
    [attachStream],
  );
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvas.current = el;
  }, []);

  const setAutoFrame = useCallback((on: boolean) => {
    hint.current.enabled = on;
    setAutoFrameState(on);
    writeFlag(AUTO_FRAME_KEY, on);
  }, []);

  const setGestureStart = useCallback((on: boolean) => {
    setGestureStartState(on);
    writeFlag(GESTURE_KEY, on);
  }, []);

  const subscribeGesture = useCallback((fn: GestureListener) => {
    gestureListeners.current.add(fn);
    return () => {
      gestureListeners.current.delete(fn);
    };
  }, []);

  const subscribeGestureDiag = useCallback((fn: GestureDiagListener) => {
    diagListeners.current.add(fn);
    return () => {
      diagListeners.current.delete(fn);
    };
  }, []);

  /** Routine screens switch recognition on only while waiting to start; `reason` says why it's off. */
  const setGestureActive = useCallback((on: boolean, reason = "not on a routine screen") => {
    gestureOffReason.current = reason;
    if (gestureActive.current === on) return;
    gestureActive.current = on;
    trigger.current.reset();
    gestureListeners.current.forEach((fn) => fn(IDLE_GESTURE));
    // Load the model the first time it's needed, not at camera start.
    if (on && !recognizer.current && !recognizerLoading.current) {
      recognizerLoading.current = true;
      createGestureRecognizer()
        .then((r) => {
          recognizer.current = r;
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          gestureErrorRef.current = msg;
          setGestureError(msg);
        })
        .finally(() => {
          recognizerLoading.current = false;
        });
    }
  }, []);

  /** Routine screens report whether they need the full frame and whether a rep is under way. */
  const setFramingHint = useCallback((h: { fullFrame: boolean; lock: boolean }) => {
    hint.current.fullFrame = h.fullFrame;
    hint.current.lock = h.lock;
  }, []);

  const getZoom = useCallback(() => framer.current.zoom, []);

  /** Turn `[gesture]` console logging on with the debug toggle, and expose a test hook. */
  const setGestureLogging = useCallback((on: boolean) => {
    gestureLogging.current = on;
    const w = window as unknown as { rehabDebug?: unknown };
    if (on) {
      w.rehabDebug = {
        /** Replace pose output with these landmarks (MediaPipe format), or null to stop. */
        injectPose: (lm: RawLandmark[] | null) => {
          injectedPose.current = lm;
        },
      };
    } else {
      delete w.rehabDebug;
      injectedPose.current = null;
    }
  }, []);

  // One frame loop for the app's lifetime: camera → pose model → smoother →
  // framing → draw → listeners. Detection always runs on the full, uncropped frame.
  useEffect(() => {
    let raf = 0;
    let lastVideoTime = -1;
    let lastAspect = 0;
    let lastGestureT = -Infinity;
    const canvases: RecognizerCanvases = {
      left: document.createElement("canvas"),
      right: document.createElement("canvas"),
      full: document.createElement("canvas"),
    };
    const smoother = new PoseSmoother(SETTINGS.pose);
    // `[gesture]` logs, at most once per second per stage, only with debug on.
    const lastLog = new Map<string, number>();
    const log = (stage: string, t: number, ...args: unknown[]) => {
      if (!gestureLogging.current || t - (lastLog.get(stage) ?? -Infinity) < 1000) return;
      lastLog.set(stage, t);
      console.log(`[gesture] ${stage}`, ...args);
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = performance.now();
      const c = canvas.current;
      const v = video.current;
      const lm = landmarker.current;
      if (!v || !lm || v.readyState < 2 || v.currentTime === lastVideoTime) return;
      lastVideoTime = v.currentTime;
      const detected = lm.detectForVideo(v, t).landmarks[0] ?? null;
      const raw = injectedPose.current ?? detected;
      const size = { width: v.videoWidth, height: v.videoHeight };
      const frame = smoother.process(raw, size.width / size.height, t);
      if (size.width / size.height !== lastAspect) {
        lastAspect = size.width / size.height;
        setAspect(lastAspect);
      }

      // Frame on the smoothed landmarks, so the crop doesn't chase detection jitter.
      const crop = framer.current.update(frame?.draw ?? null, t, hint.current);
      if (c) {
        sizeCanvas(c, size.width, size.height);
        const ctx = c.getContext("2d");
        if (ctx) drawView(ctx, v, crop, frame);
      }
      listeners.current.forEach((fn) => fn(frame, t));

      // Start-gesture checks, at a reduced rate. They need a detected pose but not a
      // green framing check or visible hips (the screen decides whether a gesture can
      // start). Requiring the hips here used to block both gestures at a desk.
      if (t - lastGestureT >= 1000 / SETTINGS.gesture.ratePerSec) {
        lastGestureT = t;
        const active = gestureActive.current;
        const person = frame !== null;
        let rec: string;
        let raise: string;
        let hands: HandResult[] = [];
        let images: GestureDiag["images"] = [];
        log("1 loop", t, { active, offReason: active ? null : gestureOffReason.current, injected: !!injectedPose.current });
        log("2 state", t, { person, torso: frame?.torso ?? null, gestureScale: gestureScale(frame, SETTINGS.gesture), recognizerLoaded: !!recognizer.current, loading: recognizerLoading.current });
        if (!active) {
          rec = raise = gestureOffReason.current;
        } else if (!person) {
          rec = raise = "no person visible";
        } else {
          raise = "running";
          if (recognizer.current) {
            rec = "running";
            // A recognizer failure must not stop the raise-hand check or the trigger below.
            try {
              ({ hands, images } = recognizeHands(recognizer.current, v, frame, canvases));
              log("3 recognizer called", t, images.map((i) => `${i.label}: ${i.canvas.width}x${i.canvas.height}`));
              log("4 recognizer result", t, hands.map((h) => `${h.source}: ${h.detected ? "hand" : "no hand"} ${h.top ?? "-"} ${h.topScore.toFixed(2)}`));
            } catch (err) {
              rec = `recognizer error: ${err instanceof Error ? err.message : String(err)}`;
              log("3 recognizer error", t, err);
            }
          } else {
            rec = gestureErrorRef.current ? `model failed to load: ${gestureErrorRef.current}` : "model loading…";
          }
        }

        const raised = active && person ? raisedHand(frame, SETTINGS.gesture) : null;
        const scale = gestureScale(frame, SETTINGS.gesture);
        if (active && frame && scale) {
          const f = frame;
          const torso = scale;
          const side = (w: number, sh: number) => ({
            wristY: +f.lm[w].y.toFixed(3),
            shoulderY: +f.lm[sh].y.toFixed(3),
            wristVis: +f.lm[w].v.toFixed(2),
            aboveTorso: +((f.lm[sh].y - f.lm[w].y) / torso).toFixed(2),
          });
          log("5 raise", t, { left: side(15, 11), right: side(16, 12), need: SETTINGS.gesture.raiseAboveTorso, scaleFrom: frame.torso ? "torso" : "shoulders", raised });
        }
        if (active) {
          let state = IDLE_GESTURE;
          if (person) state = trigger.current.update({ hands, raised }, t);
          else trigger.current.reset();
          log("6 trigger", t, { ...trigger.current.debug(), progress: state.progress, kind: state.kind, listeners: gestureListeners.current.size });
          if (state.fired && gestureLogging.current) console.log("[gesture] 6 fired", state.kind, "→ notifying", gestureListeners.current.size, "listener(s)");
          gestureListeners.current.forEach((fn) => fn(state));
        }
        const diag: GestureDiag = { recognizer: rec, raiseHand: raise, hands, raised, images, trigger: trigger.current.debug() };
        diagListeners.current.forEach((fn) => fn(diag));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Release the camera and model when the app unmounts.
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      landmarker.current?.close();
      recognizer.current?.close();
    },
    [],
  );

  return {
    status,
    error,
    autoFrame,
    setAutoFrame,
    gestureStart,
    setGestureStart,
    gestureError,
    setGestureActive,
    subscribeGesture,
    subscribeGestureDiag,
    setGestureLogging,
    setFramingHint,
    getZoom,
    aspect,
    ensureCamera,
    releaseCamera,
    subscribe,
    videoRef,
    canvasRef,
  };
}

export type PoseSource = ReturnType<typeof usePoseSource>;
