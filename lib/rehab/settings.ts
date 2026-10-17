// All targets and thresholds for the rehab tracker live here so they can be
// tuned in one place. Distances are in torso lengths (shoulder midpoint to hip
// midpoint), so they don't depend on body size or how far away the camera is.
// Keep this file free of imports: the Node simulation test loads it directly.

export const SETTINGS = {
  pose: {
    // A landmark is only trusted when MediaPipe's visibility score is above this.
    minVisibility: 0.5,
    // EMA weight given to each new frame (0..1). Higher = more responsive,
    // lower = smoother but laggier. Applied to every landmark coordinate.
    landmarkSmoothing: 0.5,
    // Separate, heavier smoothing for torso length, the scale everything is
    // divided by, so a jittery normalizer doesn't make every measure jitter.
    torsoSmoothing: 0.2,
    // Forget smoothed history if no pose is seen for this long (ms).
    resetAfterMs: 500,
  },

  camera: {
    // Ask for 1080p so there's room to crop when auto-framing; fall back to 720p.
    ideal: { width: 1920, height: 1080 },
    fallback: { width: 1280, height: 720 },
  },

  framing: {
    // Auto-framing ("follow and focus") is on by default; the routine screen has a toggle.
    enabledByDefault: true,
    // Space added around the landmark box on each side, as a fraction of the box size.
    padding: 0.15,
    // Extra space above the box for the head (landmarks stop at the eyes and ears).
    headPadding: 0.25,
    // Fraction of the remaining distance the crop moves toward its target each frame.
    ease: 0.07,
    // Never zoom in further than this (2 = show half the frame's width and height).
    maxZoom: 2.5,
    // The box covers everywhere the body has been in this window, so the range of
    // motion (e.g. sitting and standing) stays in view instead of only the current pose.
    envelopeMs: 3000,
    // Ignore target changes smaller than this (fraction of the crop size) so the view stays still.
    deadband: 0.08,
    // Drift back to the full frame if nobody is seen for this long (ms).
    lostResetMs: 1500,
  },

  gesture: {
    // Start an exercise by holding a thumbs-up, or raising a hand, toward the camera.
    // One toggle (on the routine screen) covers both.
    enabledByDefault: true,
    // MediaPipe Gesture Recognizer "Thumb_Up" score needed for a check to count.
    minScore: 0.55,
    // Weaker detections also count once "Thumb_Up" has been the top category,
    // scoring at least softMinScore, for softConsecutive checks in a row.
    softMinScore: 0.45,
    softConsecutive: 3,
    // How long the thumbs-up must be held before the exercise starts.
    holdMs: 1000,
    // A gap in detection shorter than this doesn't reset a hold (one missed check
    // at 10 per second). Longer gaps, i.e. dropping the hand, reset the ring.
    graceMs: 250,
    // Ignore further start gestures for this long after one fires.
    cooldownMs: 2000,
    // Recognition checks per second while waiting to start (pose tracking runs every frame).
    ratePerSec: 10,
    // Side of the square cropped around each hand, in torso lengths. Cropping makes a
    // distant hand big enough to recognize.
    cropTorso: 0.9,
    // Shift the crop up by this fraction of its size, leaving room for a raised thumb.
    cropRaise: 0.15,
    // Without Pose hand points, the hand center is this far past the wrist along the
    // elbow→wrist line, in torso lengths.
    handOffsetTorso: 0.25,
    // Crops are scaled to at least this many pixels square before recognition.
    minCropPx: 256,
    // Raise-hand fallback (Pose only, works from far away): a wrist at least this many
    // torso lengths above its shoulder, held for raiseHoldMs.
    raiseAboveTorso: 0.2,
    raiseHoldMs: 1500,
    // Gestures don't need the hips (often hidden by a desk or out of frame). Without
    // them, torso length is estimated as shoulder width × this.
    shoulderToTorso: 1.4,
  },

  flow: {
    countdownMs: 3000,
    // Time to get into position before each calibration step starts sampling.
    calibrationPrepMs: 3000,
    // Sampling time for each calibration step (only counts while visible).
    calibrationSampleMs: 2000,
    // Suggested rest on the break screen. The timer counts up and never auto-advances.
    suggestedRestSec: 60,
    // How long a one-off message ("Sit down slowly") stays on screen.
    messageMs: 3000,
  },

  sitToStand: {
    targetReps: 10,
    // Defaults for (kneeY - hipY) / torsoLength, used if calibration is unclear.
    // Seated: thighs point at the camera, so knees sit just below the hips (small).
    // Standing: thighs are vertical, so knees are almost a torso length below (large).
    defaultSeated: 0.15,
    defaultStanding: 0.95,
    // If standing minus seated is below this, calibration is treated as failed.
    minCalibrationRange: 0.25,
    // Thresholds on the normalized 0 (seated) to 1 (standing) value. The gap
    // between them is hysteresis, so jitter near either one can't double count.
    upThreshold: 0.75,
    downThreshold: 0.3,
    // A sit-down faster than this (leaving 0.75 to reaching 0.3) gets "Sit down slowly".
    minDescentSec: 1.5,
    smoothing: 0.4,
  },

  marching: {
    targetLiftsPerSide: 10,
    // Knee lift progress: 0 = resting knee height, 1 = knee level with hip.
    // A lift starts above liftFraction and is counted when the knee drops back below returnFraction.
    liftFraction: 0.4,
    returnFraction: 0.15,
    // Prompt to lift higher when a side's average peak is this far below the other side's
    // (in progress units, 0.15 = 15% of hip height).
    imbalanceWarning: 0.15,
    smoothing: 0.5,
  },

  walk: {
    targetLaps: 4,
    // Apparent body size relative to the start position. Below farRatio = far
    // point reached; back above backRatio = returned to the start.
    farRatio: 0.5,
    backRatio: 0.85,
    // Pause and prompt if the person is out of view this long (ms).
    lostTimeoutMs: 5000,
    smoothing: 0.25,
  },

  singleLeg: {
    holdsPerSide: 3,
    holdSec: 10,
    // A foot counts as lifted when its ankle is higher than the other ankle by
    // more than liftThreshold torso lengths. It counts as down again only below
    // dropThreshold (hysteresis so a wobble doesn't end the hold).
    liftThreshold: 0.08,
    dropThreshold: 0.05,
    // Fallback when the ankles are out of view (camera close or low): one knee
    // higher than the other by more than this many torso lengths.
    kneeLiftThreshold: 0.1,
    kneeDropThreshold: 0.06,
    // Live sway indicator: window used for the standard deviation, and the
    // values (torso lengths) labeled "some" and "a lot of" sway.
    swayWindowMs: 2000,
    swaySome: 0.02,
    swayHigh: 0.05,
    smoothing: 0.5,
  },

  stretches: {
    // When true, the hamstring stretch (hip flexion past 90° is a common
    // restriction after hip replacement) is skipped and a note says to follow
    // the surgeon's guidance.
    hipPrecautions: false,
    // Torso upright: horizontal offset of shoulder midpoint from hip midpoint, in torso lengths.
    maxTorsoLean: 0.3,

    quad: {
      holdsPerSide: 2,
      holdSec: 20,
      // Bent knee: hip-knee-ankle angle below this (heel pulled toward the buttock).
      bentKneeMaxDeg: 90,
      // Standing leg: knee angle above this = straight.
      standingKneeMinDeg: 160,
      // Knees side by side: knee heights may differ by at most this many torso
      // lengths (the bent knee drifting forward or back raises it).
      maxKneeHeightGap: 0.2,
    },

    hamstring: {
      holdsPerSide: 2,
      holdSec: 20,
      // Side view: shoulder width below this fraction of torso length.
      sideViewMaxShoulderRatio: 0.35,
      // Front (stretched) knee straight.
      frontKneeMinDeg: 160,
      // Hip hinge (shoulder-hip-knee angle): 180 = upright. Inside this range = hinged forward.
      hingeMinDeg: 120,
      hingeMaxDeg: 165,
      // Back knee slightly bent.
      backKneeMinDeg: 140,
      backKneeMaxDeg: 175,
    },

    sideRaise: {
      repsPerSide: 10,
      // Leg angle from vertical (hip→ankle, or hip→knee if the ankles are hidden).
      // A rep counts when it reaches liftDeg and comes back below returnDeg.
      liftDeg: 20,
      returnDeg: 8,
      // Torso angle from vertical above this gets "Keep your body upright".
      maxLeanDeg: 10,
      smoothing: 0.5,
    },
  },
} as const;

export type Settings = typeof SETTINGS;
