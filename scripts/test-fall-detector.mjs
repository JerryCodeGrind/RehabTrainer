// Scenario tests for the rule-based fall detector, on synthetic poses.
//   npm run test:fall
import assert from "node:assert/strict";
import test from "node:test";
import { FallDetector } from "../lib/fall/detector.ts";

const ASPECT = 16 / 9;
const FRAME_MS = 33;

// Torso centered at (x, y) in frame units, `torso` frame heights long, tilted
// `tilt` degrees from upright. Only the shoulders and hips matter.
function pose({ x = 0.5, y = 0.45, torso = 0.3, tilt = 0 }) {
  const r = (tilt * Math.PI) / 180;
  const dx = (Math.sin(r) * torso) / 2 / ASPECT;
  const dy = (Math.cos(r) * torso) / 2;
  const shoulders = { x: x + dx, y: y - dy };
  const hips = { x: x - dx, y: y + dy };
  const landmarks = Array.from({ length: 33 }, () => ({ x, y }));
  landmarks[11] = landmarks[12] = shoulders;
  landmarks[23] = landmarks[24] = hips;
  return landmarks;
}

const STANDING = { x: 0.5, y: 0.45, torso: 0.3, tilt: 0 };

// Each segment moves the pose linearly from the previous one to `to` over `ms`;
// `to: null` means no one is detected. Returns every status seen.
function simulate(segments, start = STANDING) {
  const detector = new FallDetector(ASPECT);
  const statuses = [];
  let t = 0;
  let from = start;
  for (const { ms, to } of segments) {
    for (let elapsed = 0; elapsed < ms; elapsed += FRAME_MS, t += FRAME_MS) {
      if (to === null) {
        statuses.push(detector.update(t, null));
        continue;
      }
      const k = Math.min(1, (elapsed + FRAME_MS) / ms);
      const p = { ...from, ...to };
      for (const key of Object.keys(p)) p[key] = from[key] + (p[key] - from[key]) * k;
      statuses.push(detector.update(t, pose(p)));
    }
    if (to !== null) from = { ...from, ...to };
  }
  return statuses;
}

const everFell = (statuses) => statuses.some((s) => s.phase === "fallen");
// When the alarm first went off (ms into the simulation), or null.
const fellAt = (statuses) => {
  const i = statuses.findIndex((s) => s.phase === "fallen");
  return i === -1 ? null : i * FRAME_MS;
};
const last = (statuses) => statuses.at(-1);

test("standing still is not a fall", () => {
  assert.equal(everFell(simulate([{ ms: 5000, to: STANDING }])), false);
});

test("no one in view is not a fall", () => {
  assert.equal(everFell(simulate([{ ms: 5000, to: null }])), false);
});

test("falling to the floor and staying there", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.95, tilt: 80 } },
    { ms: 4000, to: { y: 0.95, tilt: 80 } },
  ]);
  assert.equal(last(s).phase, "fallen");
  assert.equal(last(s).reason, "on-floor");
});

test("a fast fall alarms within a few seconds", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.95, tilt: 80 } },
    { ms: 20000, to: { y: 0.95, tilt: 80 } },
  ]);
  assert.ok(fellAt(s) < 5000, `alarm at ${fellAt(s)} ms`);
});

test("falling to the knees, then slumping to the floor", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 500, to: { y: 0.8 } },
    { ms: 1000, to: { y: 0.8 } },
    { ms: 1000, to: { y: 0.95, tilt: 70 } },
    { ms: 20000, to: { y: 0.95, tilt: 70 } },
  ]);
  assert.ok(fellAt(s) < 8000, `alarm at ${fellAt(s)} ms; should count as a fast fall`);
});

test("sliding slowly down to the floor (no fast drop)", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 4000, to: { y: 0.95, tilt: 20 } },
    { ms: 20000, to: { y: 0.95, tilt: 20 } },
  ]);
  assert.equal(last(s).phase, "fallen");
  assert.equal(last(s).reason, "on-floor");
  assert.ok(fellAt(s) > 15000, `alarm at ${fellAt(s)} ms, before the slow-fall wait`);
});

test("slowly going down out of the bottom of the frame", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 3000, to: { y: 0.75 } },
    { ms: 20000, to: null },
  ]);
  assert.equal(last(s).phase, "fallen");
  assert.equal(last(s).reason, "out-of-frame");
  assert.ok(fellAt(s) > 15000, `alarm at ${fellAt(s)} ms, before the slow-fall wait`);
});

test("lying on the floor in view while tracking drops out", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.95, tilt: 80 } },
    { ms: 1000, to: { y: 0.95, tilt: 80 } },
    { ms: 4000, to: null },
  ]);
  assert.equal(last(s).phase, "fallen");
  assert.equal(last(s).reason, "on-floor");
});

test("lying down on a bed, slowly or by flopping onto it", () => {
  for (const ms of [3000, 400]) {
    const s = simulate([
      { ms: 1000, to: STANDING },
      { ms, to: { y: 0.77, tilt: 85 } },
      { ms: 30000, to: { y: 0.77, tilt: 85 } },
    ]);
    assert.equal(everFell(s), false, `${ms} ms onto the bed`);
  }
});

test("sitting in a chair for a long time", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 1500, to: { y: 0.75 } },
    { ms: 60000, to: { y: 0.75 } },
  ]);
  assert.equal(everFell(s), false);
});

test("sliding from a chair to the floor after sitting a while", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 1500, to: { y: 0.75 } },
    { ms: 60000, to: { y: 0.75 } },
    { ms: 3000, to: { y: 0.95, tilt: 30 } },
    { ms: 20000, to: { y: 0.95, tilt: 30 } },
  ]);
  assert.equal(last(s).phase, "fallen");
});

test("falling out of the bottom of the frame", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 300, to: { y: 0.75 } },
    { ms: 4000, to: null },
  ]);
  assert.equal(last(s).phase, "fallen");
  assert.equal(last(s).reason, "out-of-frame");
});

test("dropping out of the bottom before much of the fall is visible", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 200, to: { y: 0.65 } }, // only 0.67 torso lengths before tracking is lost
    { ms: 4000, to: null },
  ]);
  assert.equal(last(s).phase, "fallen");
});

test("stumbling and getting straight back up", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.95, tilt: 80 } },
    { ms: 1000, to: { y: 0.95, tilt: 80 } },
    { ms: 800, to: STANDING },
    { ms: 4000, to: STANDING },
  ]);
  assert.equal(everFell(s), false);
  assert.equal(last(s).phase, "watching");
});

test("sitting down quickly in a chair", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 500, to: { y: 0.75 } }, // fast enough to look like a drop, but stays upright
    { ms: 6000, to: { y: 0.75 } },
  ]);
  assert.equal(everFell(s), false);
  assert.equal(last(s).phase, "watching");
});

test("crouching to pick something up", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.75, tilt: 50 } },
    { ms: 3500, to: { y: 0.75, tilt: 50 } },
    { ms: 800, to: STANDING },
    { ms: 2000, to: STANDING },
  ]);
  assert.equal(everFell(s), false);
});

test("walking out the side of the frame", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 1000, to: { x: 0.98 } },
    { ms: 5000, to: null },
  ]);
  assert.equal(everFell(s), false);
});

test("walking off sideways when framed close (hips near the bottom edge)", () => {
  const close = { ...STANDING, y: 0.7 };
  const s = simulate(
    [
      { ms: 1000, to: close },
      { ms: 1000, to: { x: 0.98 } },
      { ms: 20000, to: null },
    ],
    close,
  );
  assert.equal(everFell(s), false);
});

test("walking toward the camera", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 1000, to: { y: 0.55, torso: 0.6 } },
    { ms: 3000, to: { y: 0.55, torso: 0.6 } },
  ]);
  assert.equal(everFell(s), false);
});

test("brief tracking dropouts while standing", () => {
  const detector = new FallDetector(ASPECT);
  for (let i = 0; i < 150; i++) {
    const status = detector.update(i * FRAME_MS, i % 5 === 0 ? null : pose(STANDING));
    assert.equal(status.phase, "watching");
  }
});

test("flickering false detections with no one there", () => {
  const detector = new FallDetector(ASPECT);
  // A phantom body shows up for 2 frames out of every 10, at random spots.
  for (let i = 0; i < 1800; i++) {
    const phantom = i % 10 < 2 ? pose({ x: Math.random(), y: 0.3 + Math.random() * 0.7 }) : null;
    const status = detector.update(i * FRAME_MS, phantom);
    assert.equal(status.personInView, false, `frame ${i}`);
    assert.equal(status.phase, "watching", `frame ${i}`);
  }
});

test("a steady false detection low in the frame after the person leaves", () => {
  const s = simulate([
    { ms: 2000, to: STANDING },
    { ms: 3000, to: null },
    { ms: 33, to: { y: 0.95 } },
    { ms: 30000, to: { y: 0.95 } },
  ]);
  assert.equal(everFell(s), false);
});

test("one-frame glitches that snap the skeleton to the floor", () => {
  const detector = new FallDetector(ASPECT);
  for (let i = 0; i < 1800; i++) {
    const glitch = i % 30 === 0 || i % 30 === 1; // two bad frames in a row, once a second
    const status = detector.update(i * FRAME_MS, pose(glitch ? { ...STANDING, y: 0.95 } : STANDING));
    assert.equal(status.phase, "watching", `frame ${i}`);
  }
});

test("poses whose shoulders MediaPipe can't actually see don't count", () => {
  const detector = new FallDetector(ASPECT);
  const faint = pose(STANDING).map((l) => ({ ...l, visibility: 0.2 }));
  for (let i = 0; i < 100; i++) {
    assert.equal(detector.update(i * FRAME_MS, faint).personInView, false);
  }
});

test("jittery landmarks while standing", () => {
  const detector = new FallDetector(ASPECT);
  for (let i = 0; i < 1800; i++) {
    const jitter = { ...STANDING, y: STANDING.y + (Math.random() - 0.5) * 0.06 };
    assert.equal(detector.update(i * FRAME_MS, pose(jitter)).phase, "watching", `frame ${i}`);
  }
});

test("falling out of view, then being picked up again on the floor", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 300, to: { y: 0.75 } },
    { ms: 1500, to: null },
    { ms: 33, to: { y: 0.98, tilt: 80 } },
    { ms: 5000, to: { y: 0.98, tilt: 80 } },
  ]);
  assert.equal(last(s).phase, "fallen");
});

test("leaving and coming back, then falling", () => {
  const s = simulate([
    { ms: 1000, to: STANDING },
    { ms: 5000, to: null },
    { ms: 1000, to: STANDING },
    { ms: 600, to: { y: 0.95, tilt: 80 } },
    { ms: 5000, to: { y: 0.95, tilt: 80 } },
  ]);
  assert.equal(last(s).phase, "fallen");
});
