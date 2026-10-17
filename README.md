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

## Fall monitor

`/monitor` watches the webcam continuously and sounds an alarm when someone falls. It doesn't use a trained fall model:
MediaPipe Pose (lite) tracks the body in the browser, and `lib/fall/detector.ts` applies simple rules to the torso
(the midpoint of the shoulders and hips). Distances are in torso lengths, so they work near and far from the camera.

A pose only counts as a person once MediaPipe sees its shoulders clearly and has tracked it steadily for 0.4 s, and
its position is smoothed over the last 5 frames, so flickering false detections and one-frame glitches are ignored.
When someone (re)appears after being gone, their standing height is learned afresh.

A person is **down** when they're either:

- **on the floor:** 1.5+ torso lengths below their standing height (the highest they've been in the last 10 minutes), or
- **out of frame:** tracking is lost while their hips were in the bottom quarter of the view and they were already below standing height (for cameras that can't see the floor).

Staying down raises the alarm: after **3 s** if they got there with a fast drop (0.9+ torso lengths within 1 s), or
after **15 s** if they went down slowly (sliding down a wall, a slow collapse). Getting back up cancels it. Sitting in a
chair, crouching, or lying on a bed or couch doesn't go low enough to count; sitting or lying on the floor on purpose
does, after 15 s.

The alarm beeps until someone presses **I'm OK**, which also resets standing height. Thresholds live in `FALL_CONFIG`; check changes with:

```bash
npm run test:fall
```

The monitor keeps the screen awake and reconnects if the camera drops out, but browsers pause it when the tab is hidden, so keep the page visible (for example on a dedicated laptop or tablet).

## Test alert (Twilio)

When the fall alarm goes off, `/monitor` calls and texts `ALERT_TO_NUMBER` ("A fall was detected. Please check on
them.") once, and shows the result on the alarm screen. The **Test Alert** button sends the same alert marked "TEST". Add these to `.env.local` (gitignored); all numbers need the
`+` country-code format:

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15551234567   # your Twilio number
ALERT_TO_NUMBER=+15557654321      # who gets the alert; must be verified on a trial account
```

On a trial account, Twilio assigns the sender number: copy the **From** number on **Messaging → Try out SMS** into
`TWILIO_FROM_NUMBER`. The call speaks the message (fetched from Twilio's Twimlets service), but on a trial the SMS can
only use Twilio's sample wording; that switches automatically once the account is upgraded.

`triggerAlert()` in `lib/alert/server.ts` (server-only) sends the call and SMS; `POST /api/alert/fall` and
`POST /api/alert/test` run it, at most once a minute and once every 30 s respectively. It only ever contacts `ALERT_TO_NUMBER`, and rejects anything that isn't a full phone number
(so never 911 or other emergency numbers). The result, or Twilio's error, is shown under the button.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
