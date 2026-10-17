This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, add your Roboflow API key (from [app.roboflow.com/settings/api](https://app.roboflow.com/settings/api)) to `.env.local`, which is gitignored:

```bash
ROBOFLOW_API_KEY=your_key_here
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Home rehab tracker

The home page is a full-body rehab tracker for people recovering from a stroke or hip/knee surgery. It uses MediaPipe Pose Landmarker (lite model, GPU delegate with CPU fallback) and has five routines: sit-to-stand, marching in place, walk out and back, single-leg stance, and standing hip and leg stretches (quad stretch, hamstring stretch, side leg raises; set `stretches.hipPrecautions` to skip the hamstring stretch).

| File | Role |
| --- | --- |
| `lib/rehab/settings.ts` | Every target and threshold, with comments on what each measures |
| `lib/rehab/pose.ts` | Landmark indices, EMA smoothing, torso normalization, joint-angle helper |
| `lib/rehab/routines/*.ts` | One class per routine behind the shared `Routine` interface (`calibrate`, `update`, `isComplete`, `getSummary`, `getFeedback`); register new ones in `routines/index.ts` |
| `lib/rehab/framing.ts` | Auto-framing: crops the displayed picture to follow the user. Detection always uses the full frame |
| `lib/rehab/runner.ts` | Phases: ready → countdown → calibration → tracking → done |
| `lib/rehab/storage.ts` | Session history in `localStorage`, today's status, streak |
| `lib/rehab/demo.ts` | Keyboard-driven synthetic pose for testing without a camera |
| `app/components/rehab/` | Screens, plus `usePoseSource` (one shared camera and model) |

- **Auto-framing:** on by default, toggled per device from the routine screen. The walk routine always shows the full frame.
- **Gesture start:** on a routine screen, hold a thumbs-up for 1 s (MediaPipe Gesture Recognizer on crops around each hand) or raise a hand above your shoulder for 1.5 s (Pose only, works from far away). Toggle per device; the button still works. With debug on, a "Start gesture diagnostics" panel shows each stage, the console gets `[gesture]` logs (once per second per stage), and `window.rehabDebug.injectPose(landmarks)` replaces the pose model output for testing. Gestures only need the upper body; without visible hips, scale comes from shoulder width.
- **Framing check:** Start Exercise unlocks only when every joint the routine needs is visible.
- **Demo mode:** tick "Demo mode" on the home screen, then use the keys listed on each routine screen.
- **Debug panel:** press `` ` `` or click "Debug" to see raw measurements and state.
- **Logic tests:** `npm run test:rehab` runs every routine end to end on the demo pose in Node.

## Roboflow: White Monster workflow (Task 1)

Task 1 detects Monster Energy cans (one class, `monster_can`; RF-DETR small) live from the webcam using the Roboflow Workflow
`eureka-qanyp/white-monster-vwhite-monster-1-rfdetr-small-t1-logic`, which wraps the inner workflow `white-monster` at confidence 0.4. Video is streamed over WebRTC with
[`@roboflow/inference-sdk`](https://www.npmjs.com/package/@roboflow/inference-sdk); detections come back on a data channel
and are drawn over the local camera view.

| File | Role |
| --- | --- |
| `lib/roboflow/monsters.ts` | Workflow constants, `MonsterDetection`/`MonsterFrame` types, `parseMonsterPredictions()` (client + server) |
| `lib/roboflow/server.ts` | Server only: `startMonsterStream()` (WebRTC session), `getTurnServers()`, `detectMonsters()` (single image over HTTP); timeouts, retries, `RoboflowError` |
| `app/api/roboflow/webrtc/route.ts` | Signaling proxy for `connectors.withProxyUrl()`; the workflow is pinned server-side |
| `app/api/roboflow/turn/route.ts` | TURN credentials for players behind strict NATs |
| `lib/roboflow/useMonsterStream.ts` | React hook: `{ videoRef, status, frame, error, start, stop }` |
| `app/components/MonsterCamera.tsx` | Mirrored camera view with detection boxes |

The API key stays on the server. The browser only talks to `/api/roboflow/*`.

The workflow has one output, `predictions`:

```json
{ "image": { "width": 640, "height": 800 },
  "predictions": [{ "x": 0, "y": 0, "width": 0, "height": 0,
                    "confidence": 0.0, "class": "monster_can", "class_id": 0, "detection_id": "…" }] }
```

`x`/`y` are the box **center** in pixels of the frame the model saw, which may be downscaled from the camera, so scale by `image.width`/`height`.
With no detections, `image.width`/`height` come back `null`.

(Values above are placeholders showing the shape.) The model is trained on a small dataset (68 images) and doesn't fire on the stock photo in `scripts/fixtures/`, so the smoke test checks the response shape, not recall.

Smoke test (calls the real workflow over HTTP and opens a WebRTC session):

```bash
npm run smoke:roboflow
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
