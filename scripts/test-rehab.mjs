// Runs every routine end to end on the synthetic demo pose (no camera, no browser).
//   npm run test:rehab
import assert from "node:assert/strict";
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

const { SETTINGS } = await import("../lib/rehab/settings.ts");
const { PoseSmoother } = await import("../lib/rehab/pose.ts");
const { DemoPose, DEMO_ASPECT } = await import("../lib/rehab/demo.ts");
const { RoutineRunner } = await import("../lib/rehab/runner.ts");
const { streak, completedToday } = await import("../lib/rehab/storage.ts");
const { bodyHealth, strongestMuscle, needsWork } = await import("../lib/rehab/health.ts");
const { AutoFramer } = await import("../lib/rehab/framing.ts");
const { StartGestureTrigger, handCrops, raisedHand, gestureScale } = await import("../lib/rehab/gesture.ts");

const FPS = 30;

/** Simulated session: a demo pose, a smoother and a runner sharing one clock. */
function session(id, settings = SETTINGS) {
  const demo = new DemoPose();
  const smoother = new PoseSmoother(SETTINGS.pose);
  const runner = new RoutineRunner(id, settings);
  let t = 0;
  const events = [];
  const step = (ms) => {
    for (let end = t + ms; t < end; t += 1000 / FPS) {
      const frame = smoother.process(demo.frame(t), DEMO_ASPECT, t);
      events.push(...runner.onFrame(frame, t));
    }
  };
  const key = (k, holdMs = 0) => {
    demo.keyDown(k);
    if (holdMs) {
      step(holdMs);
      demo.keyUp(k);
    }
  };
  runner.start(0);
  return { demo, runner, step, key, events, view: () => runner.snapshot() };
}

function calibrateCountdown(s) {
  s.step(SETTINGS.flow.countdownMs + 50);
}

function check(name, fn) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    console.log(`FAIL ${name}`);
    throw err;
  }
}

check("sit-to-stand counts 10 reps and records descent time", () => {
  const s = session("sitToStand");
  calibrateCountdown(s);
  assert.equal(s.view().phase, "calibrating");
  // Calibration 1: sit and hold. Calibration 2: stand and hold.
  s.key("s");
  s.step(SETTINGS.flow.calibrationPrepMs + SETTINGS.flow.calibrationSampleMs + 100);
  s.key("s");
  s.step(SETTINGS.flow.calibrationPrepMs + SETTINGS.flow.calibrationSampleMs + 100);
  assert.equal(s.view().phase, "tracking");
  assert.equal(s.runner.routine.getDebug().calibrated, "true");
  assert.equal(s.view().feedback, "Sit down to begin");
  s.key("s"); // sit (arms the counter)
  s.step(3000);
  assert.equal(s.runner.routine.getProgress().done, 0, "sitting after calibration must not count");
  for (let i = 0; i < 10; i++) {
    s.key("s"); s.step(3000); // stand
    s.key("s"); s.step(3000); // sit
  }
  assert.equal(s.view().phase, "done");
  const sum = s.runner.summary();
  assert.equal(sum.reps, 10);
  assert.ok(sum.data.avgDescentSec > 0.5 && sum.data.avgDescentSec < 2, `descent ${sum.data.avgDescentSec}`);
  assert.ok(s.events.includes("complete"));
});

check("sit-to-stand pauses when body not visible", () => {
  const s = session("sitToStand");
  calibrateCountdown(s);
  s.step(15000); // default calibration while standing (both steps)
  s.key("v");
  s.step(500);
  assert.equal(s.view().inView, false);
  assert.match(s.view().feedback, /can't see your shoulders, hips or knees/);
});

check("marching counts lifts per side and finishes at 10 each", () => {
  const s = session("marching");
  calibrateCountdown(s);
  s.step(SETTINGS.flow.calibrationPrepMs + SETTINGS.flow.calibrationSampleMs + 100);
  assert.equal(s.view().phase, "tracking");
  for (let i = 0; i < 10; i++) {
    s.key("a", 600); s.step(600);
    s.key("l", 600); s.step(600);
  }
  assert.equal(s.view().phase, "done");
  const sum = s.runner.summary();
  assert.equal(sum.reps, 20);
  assert.ok(sum.data.peaksLeft.every((p) => p > 0.6 && p < 0.9), `peaks ${sum.data.peaksLeft}`);
});

check("walk counts laps with a beep at the far point", () => {
  const s = session("walk");
  calibrateCountdown(s);
  s.step(SETTINGS.flow.calibrationPrepMs + SETTINGS.flow.calibrationSampleMs + 100);
  for (let i = 0; i < 4; i++) {
    s.key("w"); s.step(4000);
    if (i === 0) assert.equal(s.events.filter((e) => e === "beep").length, 1);
    s.key("w"); s.step(4000);
  }
  assert.equal(s.view().phase, "done");
  const sum = s.runner.summary();
  assert.equal(sum.data.lapsMs.length, 4);
});

check("walk pauses lap time while lost from view", () => {
  const s = session("walk");
  calibrateCountdown(s);
  s.step(SETTINGS.flow.calibrationPrepMs + SETTINGS.flow.calibrationSampleMs + 100);
  s.key("w"); s.step(4000);
  s.key("v"); s.step(8000);
  assert.equal(s.runner.routine.getDebug().lost, "true");
  s.key("v"); s.key("w"); s.step(4000);
  const lap = s.runner.summary().data.lapsMs[0];
  assert.ok(lap < 7000, `lap ${lap} should exclude the 8 s out of view`);
});

check("single-leg stance: early drop resets, full holds count, sides alternate", () => {
  const s = session("singleLeg");
  calibrateCountdown(s);
  assert.equal(s.view().phase, "tracking");
  s.key("q"); s.step(4000); s.key("q"); s.step(1000);
  assert.equal(s.runner.routine.getProgress().done, 0);
  assert.equal(s.view().feedback, "Foot down. Try again when ready");
  for (let i = 0; i < 3; i++) { s.key("q"); s.step(10800); s.key("q"); s.step(1000); }
  assert.match(s.view().feedback, /right foot/);
  for (let i = 0; i < 3; i++) { s.key("p"); s.step(10800); s.key("p"); s.step(1000); }
  assert.equal(s.view().phase, "done");
  const sum = s.runner.summary();
  assert.equal(sum.data.left.holds, 3);
  assert.ok(sum.data.left.longestMs >= 10000);
});

check("single-leg stance falls back to knee height when the feet are hidden", () => {
  const s = session("singleLeg");
  s.key("k");
  calibrateCountdown(s);
  assert.equal(s.view().inView, true, "ankles must not be required");
  const ankles = s.view().joints.filter((j) => /ankle/i.test(j.name));
  assert.ok(ankles.length && ankles.every((j) => j.optional && !j.ok));
  s.key("q"); s.step(10800); s.key("q"); s.step(1000);
  assert.equal(s.runner.routine.getDebug()["lift measured by"], "knees");
  assert.equal(s.runner.routine.getProgress().done, 1);
});

check("marching and sit-to-stand work without the feet in view", () => {
  for (const id of ["marching", "sitToStand"]) {
    const s = session(id);
    s.key("k");
    s.step(500);
    assert.equal(s.view().inView, true, id);
  }
});

const raiseSet = (s, key, n) => {
  for (let i = 0; i < n; i++) { s.key(key, 700); s.step(700); }
};

check("hip and leg stretches: quad, hamstring, side raises with pause-not-reset", () => {
  const s = session("stretches");
  calibrateCountdown(s);
  s.key("c"); // quad stretch, left knee bent
  s.step(5000);
  s.key("f"); // lean forward
  s.step(1000);
  assert.equal(s.view().feedback, "Stand tall");
  const paused = s.view().live.timer.seconds;
  s.step(3000);
  assert.equal(s.view().live.timer.seconds, paused, "timer must pause, not run");
  assert.ok(paused > 4, "timer must not reset");
  s.key("f");
  s.step(16500);
  assert.equal(s.runner.routine.getProgress().done, 1);
  s.step(1500);
  assert.equal(s.view().feedback.includes("RIGHT knee"), true, s.view().feedback);
  for (let i = 0; i < 3; i++) { s.key("g"); s.step(21500); }
  // Hamstring: left heel forward.
  s.key("h"); s.key("g");
  s.step(2000);
  s.key("f"); s.step(4000);
  assert.equal(s.view().feedback, "Keep your front knee straight");
  s.key("f");
  for (let i = 0; i < 4; i++) { s.step(21500); s.key("g"); }
  assert.match(s.view().progress.detail, /Side leg raises, left/);
  // Side raises: face the camera.
  s.key("h");
  raiseSet(s, "z", 10);
  assert.match(s.view().progress.detail, /right/);
  s.key("f"); // lean during raises still counts, with a warning
  raiseSet(s, "m", 10);
  assert.equal(s.view().phase, "done", JSON.stringify(s.view().debug));
  const sum = s.runner.summary();
  assert.equal(sum.data.raisePeaksDeg.left.length, 10);
  assert.ok(sum.data.raisePeaksDeg.left.every((d) => d > 25 && d < 32), String(sum.data.raisePeaksDeg.left));
  assert.equal(sum.data.leaningReps, 10);
});

check("hipPrecautions skips the hamstring stretch", () => {
  const settings = { ...SETTINGS, stretches: { ...SETTINGS.stretches, hipPrecautions: true } };
  const s = session("stretches", settings);
  assert.match(s.runner.routine.info.note, /surgeon/);
  calibrateCountdown(s);
  s.key("c");
  for (let i = 0; i < 4; i++) { s.step(21500); s.key("g"); }
  assert.match(s.view().progress.detail, /Side leg raises/);
  const sum = s.runner.summary();
  assert.match(sum.metrics.find((m) => /Hamstring/.test(m.label)).value, /Skipped/);
});

check("auto-framing zooms in on a small person, holds during reps, shows full frame for the walk", () => {
  const demo = new DemoPose();
  const framer = new AutoFramer(SETTINGS.framing, SETTINGS.pose.minVisibility);
  const hint = { enabled: true, fullFrame: false, lock: false };
  // Walk away so the person is small in the frame.
  demo.keyDown("w");
  let t = 0;
  const run = (ms, h = hint) => {
    for (let end = t + ms; t < end; t += 33) framer.update(demo.frame(t), t, h);
  };
  run(4000);
  run(4000);
  assert.ok(framer.zoom > 1.3, `zoom ${framer.zoom}`);
  // Every visible landmark is inside the crop.
  const c = framer.crop;
  for (const p of demo.frame(t)) assert.ok(p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
  // Locked: small shifts don't move the target.
  const locked = framer.zoom;
  run(1000, { ...hint, lock: true });
  assert.ok(Math.abs(framer.zoom - locked) < 0.05);
  // Full frame for the walk routine.
  run(4000, { ...hint, fullFrame: true });
  assert.ok(framer.zoom < 1.02, `zoom ${framer.zoom}`);
  // Disabled: also full frame.
  run(3000);
  run(4000, { ...hint, enabled: false });
  assert.ok(framer.zoom < 1.02);
});

function gestureFeeder(trig) {
  const step = 1000 / SETTINGS.gesture.ratePerSec;
  let t = 0;
  return (sample, ms) => {
    const out = [];
    for (let end = t + ms; t < end; t += step) out.push(trig.update(sample, t));
    return out;
  };
}
const thumbs = (top, topScore) => ({ hands: [{ source: "test", detected: true, top, topScore }], raised: null });

check("thumbs-up: 1 s hold at >= 0.55 fires once, drops reset, then 2 s cooldown", () => {
  const g = SETTINGS.gesture;
  const trig = new StartGestureTrigger(g);
  const feed = gestureFeeder(trig);
  // Too weak, or another gesture on top: never fires.
  assert.ok(feed(thumbs("Thumb_Up", 0.4), 3000).every((x) => !x.fired && x.progress === 0));
  assert.ok(feed(thumbs("Open_Palm", 0.9), 2000).every((x) => !x.fired && x.progress === 0));
  // Dropping the hand early resets the ring.
  const early = feed(thumbs("Thumb_Up", 0.6), 600);
  assert.ok(early.at(-1).progress > 0.4 && !early.some((x) => x.fired));
  assert.equal(feed(thumbs("None", 0.9), 400).at(-1).progress, 0);
  // One missed check inside the grace period doesn't reset.
  feed(thumbs("Thumb_Up", 0.6), 500);
  feed(thumbs("None", 0.9), 100);
  assert.ok(feed(thumbs("Thumb_Up", 0.6), 100).at(-1).progress > 0.5);
  // A full hold fires exactly once, then the cooldown blocks a second start.
  const done = feed(thumbs("Thumb_Up", 0.6), 1000);
  assert.equal(done.filter((x) => x.fired).length, 1);
  assert.equal(done.find((x) => x.fired).kind, "thumb");
  assert.ok(feed(thumbs("Thumb_Up", 0.9), g.cooldownMs - 200).every((x) => !x.fired));
});

check("thumbs-up: weak 0.45-0.55 counts after 3 checks in a row as top category", () => {
  const trig = new StartGestureTrigger(SETTINGS.gesture);
  const feed = gestureFeeder(trig);
  const first = feed(thumbs("Thumb_Up", 0.5), 200);
  assert.ok(first.every((x) => x.progress === 0), "two weak checks are not enough");
  const rest = feed(thumbs("Thumb_Up", 0.5), 1000);
  assert.equal(rest.filter((x) => x.fired).length, 1);
  // Alternating weak / none never builds a streak.
  const trig2 = new StartGestureTrigger(SETTINGS.gesture);
  const feed2 = gestureFeeder(trig2);
  for (let i = 0; i < 20; i++) {
    assert.ok(!feed2(thumbs("Thumb_Up", 0.5), 100)[0].fired);
    feed2(thumbs("None", 0.9), 100);
  }
});

check("raise-hand fallback: wrist above shoulder held 1.5 s fires", () => {
  const demo = new DemoPose();
  const smoother = new PoseSmoother(SETTINGS.pose);
  const trig = new StartGestureTrigger(SETTINGS.gesture);
  const fired = [];
  const run = (ms, t0) => {
    for (let t = t0; t < t0 + ms; t += 100) {
      const f = smoother.process(demo.frame(t), DEMO_ASPECT, t);
      const st = trig.update({ hands: [], raised: raisedHand(f, SETTINGS.gesture) }, t);
      if (st.fired) fired.push({ t, kind: st.kind });
    }
  };
  run(2000, 0);
  assert.equal(fired.length, 0, "hand down must not fire");
  demo.keyDown("r");
  run(1300, 2000);
  assert.equal(fired.length, 0, "1.3 s is not enough");
  run(700, 3300);
  assert.equal(fired.length, 1);
  assert.equal(fired[0].kind, "raise");
});

check("gestures work with only the upper body in view (hips hidden, e.g. at a desk)", () => {
  // Regression: the gesture checks used to require torso length, which needs both
  // hips, so neither gesture could fire with the hips out of view.
  const demo = new DemoPose();
  const smoother = new PoseSmoother(SETTINGS.pose);
  const desk = (lm) => lm.map((p, i) => (i >= 23 ? { ...p, visibility: 0.2 } : p));
  let f;
  for (let t = 0; t < 500; t += 33) f = smoother.process(desk(demo.frame(t)), DEMO_ASPECT, t);
  assert.equal(f.torso, null, "hips hidden, so no torso length");
  const scale = gestureScale(f, SETTINGS.gesture);
  assert.ok(scale > 0.2 && scale < 0.3, `shoulder-based scale ${scale} should approximate the 0.25 torso`);
  assert.equal(raisedHand(f, SETTINGS.gesture), null);
  assert.equal(handCrops(f.draw, scale, { width: 1920, height: 1080 }, SETTINGS.gesture, SETTINGS.pose.minVisibility).length, 2);
  demo.keyDown("r");
  for (let t = 500; t < 1500; t += 33) f = smoother.process(desk(demo.frame(t)), DEMO_ASPECT, t);
  assert.equal(raisedHand(f, SETTINGS.gesture), "right");
});

check("hand crops: centered on the hand, raised for the thumb, 0.9 torso, forearm fallback", () => {
  const demo = new DemoPose();
  const lm = demo.frame(0);
  const frame = { width: 1920, height: 1080 };
  const cfg = SETTINGS.gesture;
  const crops = handCrops(lm, 0.25, frame, cfg, SETTINGS.pose.minVisibility);
  assert.equal(crops.length, 2);
  assert.deepEqual(crops.map((c) => c.side), ["left", "right"]);
  const size = 0.9 * 0.25 * 1080;
  assert.ok(Math.abs(crops[0].size - size) < 1);
  // Centered on the hand points, then shifted up by cropRaise.
  const hand = [17, 19, 21].map((i) => lm[i]);
  const hx = (hand.reduce((s, p) => s + p.x, 0) / 3) * 1920;
  const hy = (hand.reduce((s, p) => s + p.y, 0) / 3) * 1080;
  assert.ok(Math.abs(crops[0].x + size / 2 - hx) < 1);
  assert.ok(Math.abs(crops[0].y + size / 2 - (hy - cfg.cropRaise * size)) < 1);
  // Hand points hidden: center continues past the wrist along elbow→wrist.
  const noHands = lm.map((p, i) => ([17, 19, 21].includes(i) ? { ...p, visibility: 0.1 } : p));
  const fb = handCrops(noHands, 0.25, frame, cfg, SETTINGS.pose.minVisibility)[0];
  const wristY = lm[15].y * 1080;
  assert.ok(fb.y + size / 2 > wristY - cfg.cropRaise * size, "forearm points down, so the center moves below the wrist before the thumb shift");
  // No visible wrists: no crops (the caller uses the full frame).
  const hidden = lm.map((p) => ({ ...p, visibility: 0.1 }));
  assert.equal(handCrops(hidden, 0.25, frame, cfg, SETTINGS.pose.minVisibility).length, 0);
});

check("streak counts consecutive days", () => {
  const day = (offset) => ({ routineId: "walk", finishedAt: new Date(2026, 9, 17 - offset, 12).toISOString() });
  const now = new Date(2026, 9, 17, 18);
  assert.equal(streak([day(0), day(1), day(2), day(4)], now), 3);
  assert.equal(streak([day(1), day(2)], now), 2);
  assert.equal(streak([day(3)], now), 0);
  assert.deepEqual([...completedToday([day(0), day(1)], now)], ["walk"]);
});

check("muscle health: weaker side flagged, balance counts for the standing leg, trends", () => {
  const now = new Date(2026, 9, 17, 18);
  const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  const marching = (daysAgo, left, right) => ({
    routineId: "marching", reps: 20, target: 20, finishedAt: at(daysAgo),
    data: { peaksLeft: Array(10).fill(left), peaksRight: Array(10).fill(right) },
  });
  const muscles = bodyHealth([marching(1, 0.45, 0.8), marching(3, 0.45, 0.8)], now);
  const get = (list, id) => list.find((m) => m.id === id);
  assert.equal(get(muscles, "hipFlexors-right").level, "good");
  assert.equal(get(muscles, "hipFlexors-left").level, "fair", "a clearly weaker side is never strong");
  assert.match(get(muscles, "hipFlexors-left").notes[0], /Weaker than your right side/);
  assert.equal(get(muscles, "arms").tracked, false);
  assert.equal(get(muscles, "quads-left").level, "none");
  assert.equal(strongestMuscle(muscles).id, "hipFlexors-right");
  assert.deepEqual(needsWork(muscles).map((m) => m.id), ["hipFlexors-left"]);
  assert.equal(get(bodyHealth([marching(40, 0.8, 0.8)], now), "hipFlexors-left").level, "none", "old sessions drop out");

  // Lifting the left foot means balancing on the right leg.
  const balance = {
    routineId: "singleLeg", reps: 6, target: 6, finishedAt: at(0),
    data: { left: { holds: 3, longestMs: 10_000, sway: [0.01] }, right: { holds: 1, longestMs: 2_000, sway: [0.06] } },
  };
  const b = bodyHealth([balance], now);
  assert.ok(get(b, "calves-right").score > get(b, "calves-left").score);
  assert.ok(get(b, "abductors-right").score > get(b, "abductors-left").score);
  assert.ok(get(b, "core").score !== null);

  // Sit-to-stands score both sides the same, so they never flag a weaker side.
  const sts = bodyHealth([{ routineId: "sitToStand", reps: 10, target: 10, finishedAt: at(0), data: { avgDescentSec: 2 } }], now);
  assert.equal(get(sts, "quads-left").score, get(sts, "quads-right").score);
  assert.equal(get(sts, "glutes-left").level, "good");

  // A drop this week shows as a downward trend.
  const trend = bodyHealth([marching(1, 0.3, 0.3), marching(14, 0.8, 0.8)], now);
  assert.equal(get(trend, "hipFlexors-left").trend, "down");
});

console.log("All rehab simulations passed.");
