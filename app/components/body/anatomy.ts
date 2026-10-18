import type { RoutineId } from "@/lib/rehab/routines/types";

// An original, simplified anatomical figure on a 240 × 520 grid. Paths are
// drawn for the figure's right side (viewer's left) and mirrored across x = 120
// for the other side, so each muscle group is one region with two halves.

export type View = "front" | "back";

export type MuscleId =
  | "deltoids"
  | "pectorals"
  | "biceps"
  | "triceps"
  | "forearms"
  | "trapezius"
  | "lats"
  | "abdominals"
  | "obliques"
  | "lowerBack"
  | "hipFlexors"
  | "glutes"
  | "hipAbductors"
  | "quadriceps"
  | "adductors"
  | "hamstrings"
  | "shins"
  | "calves";

export interface MuscleGroup {
  id: MuscleId;
  name: string;
  /** Plain-language location. */
  location: string;
  area: "upper body" | "trunk" | "hips and legs";
  /** Path data per view; a group missing from a view isn't visible from that side. */
  paths: Partial<Record<View, string[]>>;
  /** Purely decorative detail lines (tendon lines, for example). */
  details?: Partial<Record<View, string>>;
  /** rupert's own exercises that commonly involve this group; `how` completes "in this exercise, this group …". General exercise knowledge, not an assessment. */
  exercises: { id: RoutineId; how: string }[];
}

const DELTOID = "M70,100 C60,102 52,111 51,127 C52,137 55,143 59,147 C63,140 67,130 71,122 C73,114 73,106 70,100 Z";
const FOREARM = "M50,207 C46,227 44,248 46,264 C50,268 54,268 56,264 C60,246 62,227 62,209 C58,204 54,204 50,207 Z";

export const MUSCLES: MuscleGroup[] = [
  {
    id: "deltoids",
    name: "deltoids",
    location: "the cap of each shoulder.",
    area: "upper body",
    paths: { front: [DELTOID], back: [DELTOID] },
    exercises: [
      { id: "lateralRaise", how: "lifts your arms out to the side." },
      { id: "overheadPress", how: "pushes your arms up overhead." },
    ],
  },
  {
    id: "pectorals",
    name: "chest (pectorals)",
    location: "the front of the upper chest.",
    area: "upper body",
    paths: { front: ["M119,96 C112,95 106,95 100,96 C90,99 80,103 74,112 C72,124 76,137 86,145 C97,150 110,148 119,144 Z"] },
    exercises: [
      { id: "wallPushup", how: "pushes you back from the wall." },
      { id: "armOpeners", how: "is stretched as your arms open wide." },
    ],
  },
  {
    id: "biceps",
    name: "biceps",
    location: "the front of the upper arm.",
    area: "upper body",
    paths: { front: ["M60,152 C56,166 54,183 56,198 C59,202 63,201 65,197 C68,181 68,165 66,152 C64,147 62,147 60,152 Z"] },
    exercises: [
      { id: "bicepCurl", how: "bends your elbows to bring your hands up." },
    ],
  },
  {
    id: "triceps",
    name: "triceps",
    location: "the back of the upper arm.",
    area: "upper body",
    paths: { back: ["M59,150 C55,165 53,183 55,199 C58,203 63,202 65,197 C68,181 68,165 66,151 C64,146 61,146 59,150 Z"] },
    exercises: [
      { id: "overheadPress", how: "straightens your elbows at the top." },
      { id: "wallPushup", how: "straightens your arms to push back." },
    ],
  },
  {
    id: "forearms",
    name: "forearms",
    location: "between the elbow and the wrist.",
    area: "upper body",
    paths: { front: [FOREARM], back: [FOREARM] },
    exercises: [
      { id: "bicepCurl", how: "steadies your wrists as you curl." },
    ],
  },
  {
    id: "trapezius",
    name: "trapezius",
    location: "the upper back, from the neck across to the shoulders.",
    area: "upper body",
    paths: { back: ["M119,64 C114,74 108,84 100,90 C89,95 78,97 69,102 C80,108 95,113 105,123 C111,140 115,160 119,180 Z"] },
    exercises: [
      { id: "armOpeners", how: "draws your shoulder blades together." },
      { id: "lateralRaise", how: "helps lift your arms." },
    ],
  },
  {
    id: "lats",
    name: "lats (latissimus dorsi)",
    location: "the sides of the mid and lower back.",
    area: "upper body",
    paths: { back: ["M75,132 C77,156 81,186 87,214 C95,222 104,227 113,226 C110,208 108,190 106,172 C103,150 94,136 75,132 Z"] },
    exercises: [],
  },
  {
    id: "abdominals",
    name: "abdominals",
    location: "the front of the trunk, between the ribs and the pelvis.",
    area: "trunk",
    paths: { front: ["M119,151 C111,151 106,152 103,156 C101,180 101,210 103,240 C107,256 112,266 119,272 Z"] },
    details: { front: "M104,178 L119,178 M103,202 L119,202 M104,226 L119,226" },
    exercises: [
      { id: "sitToStand", how: "helps brace your trunk as you lean forward and rise." },
      { id: "marching", how: "helps keep you upright as each knee lifts." },
      { id: "singleLeg", how: "helps keep your trunk steady while you balance." },
      { id: "wallPushup", how: "keeps your body in a straight line." },
    ],
  },
  {
    id: "obliques",
    name: "obliques",
    location: "the sides of the trunk, below the ribs.",
    area: "trunk",
    paths: { front: ["M87,150 C83,170 83,196 87,224 C92,238 97,248 101,254 C99,228 99,190 101,156 C96,152 91,150 87,150 Z"] },
    exercises: [
      { id: "singleLeg", how: "helps stop your trunk tipping sideways on one leg." },
      { id: "walk", how: "helps steady your trunk as you step." },
      { id: "sideBend", how: "bends your trunk to each side." },
    ],
  },
  {
    id: "lowerBack",
    name: "lower back (erector spinae)",
    location: "either side of the spine, low in the back.",
    area: "trunk",
    paths: { back: ["M119,182 C113,186 109,192 108,200 C108,216 109,232 111,246 C114,250 117,252 119,252 Z"] },
    exercises: [{ id: "sitToStand", how: "helps keep your back straight as you lean forward and stand." }],
  },
  {
    id: "hipFlexors",
    name: "hip flexors",
    location: "the front of the hip, where the thigh meets the trunk.",
    area: "hips and legs",
    paths: { front: ["M90,250 C88,258 90,266 95,273 C101,277 107,276 112,272 C108,263 103,255 97,249 C94,247 91,247 90,250 Z"] },
    exercises: [
      { id: "marching", how: "lifts each knee." },
      { id: "walk", how: "swings each leg forward." },
    ],
  },
  {
    id: "glutes",
    name: "glutes (gluteus maximus)",
    location: "the buttocks.",
    area: "hips and legs",
    paths: { back: ["M80,268 C78,284 82,296 92,302 C103,307 113,305 119,300 L119,258 C111,252 101,250 92,252 C86,256 82,261 80,268 Z"] },
    exercises: [
      { id: "sitToStand", how: "straightens your hips as you stand up." },
      { id: "walk", how: "pushes you forward with each step." },
      { id: "singleLeg", how: "holds the standing hip steady." },
    ],
  },
  {
    id: "hipAbductors",
    name: "outer hip (gluteus medius)",
    location: "the upper outer hip, above the buttocks.",
    area: "hips and legs",
    paths: { back: ["M77,242 C74,252 75,262 79,268 C83,258 90,251 99,248 C93,243 84,240 77,242 Z"] },
    exercises: [
      { id: "singleLeg", how: "keeps your pelvis level on one leg." },
      { id: "stretches", how: "lifts the leg out to the side in side leg raises." },
      { id: "walk", how: "keeps your pelvis level with each step." },
    ],
  },
  {
    id: "quadriceps",
    name: "quadriceps",
    location: "the front of the thigh.",
    area: "hips and legs",
    paths: { front: ["M78,276 C74,302 76,336 84,368 C90,374 98,374 104,368 C108,340 108,312 104,292 C96,286 87,280 78,276 Z"] },
    exercises: [
      { id: "sitToStand", how: "straightens your knees as you stand up." },
      { id: "marching", how: "helps lift and lower each leg." },
      { id: "walk", how: "controls your knee with each step." },
      { id: "stretches", how: "is stretched in the quad stretch." },
      { id: "kneeExtension", how: "straightens your knee to lift your foot." },
    ],
  },
  {
    id: "adductors",
    name: "inner thigh (adductors)",
    location: "the inside of the thigh.",
    area: "hips and legs",
    paths: { front: ["M106,294 C108,314 108,336 106,356 C110,346 114,322 118,296 C114,291 110,290 106,294 Z"] },
    exercises: [
      { id: "singleLeg", how: "helps steady the standing leg." },
      { id: "walk", how: "helps steady each step." },
    ],
  },
  {
    id: "hamstrings",
    name: "hamstrings",
    location: "the back of the thigh.",
    area: "hips and legs",
    paths: { back: ["M80,306 C78,332 82,356 88,374 C94,378 100,378 104,372 C106,350 108,328 108,308 C98,310 88,309 80,306 Z"] },
    exercises: [
      { id: "stretches", how: "is stretched in the hamstring stretch." },
      { id: "walk", how: "slows your leg at the end of each swing." },
    ],
  },
  {
    id: "shins",
    name: "shins (tibialis anterior)",
    location: "the front of the lower leg.",
    area: "hips and legs",
    paths: { front: ["M80,393 C78,420 80,450 84,473 C87,476 90,474 92,470 C92,446 92,420 90,396 C86,390 82,390 80,393 Z"] },
    exercises: [
      { id: "walk", how: "lifts your toes as each foot swings through." },
      { id: "singleLeg", how: "makes small balance corrections at the ankle." },
    ],
  },
  {
    id: "calves",
    name: "calves",
    location: "the back of the lower leg.",
    area: "hips and legs",
    paths: {
      front: ["M95,398 C97,420 99,440 100,456 C104,446 106,424 104,404 C102,398 98,395 95,398 Z"],
      back: ["M80,394 C76,416 80,440 86,457 C92,461 98,459 102,451 C104,431 104,411 100,395 C94,389 86,389 80,394 Z"],
    },
    exercises: [
      { id: "walk", how: "pushes off with each step." },
      { id: "singleLeg", how: "keeps you balanced over your foot." },
      { id: "marching", how: "steadies the standing leg." },
      { id: "heelRaise", how: "lifts your heels off the floor." },
    ],
  },
];

export const MUSCLE_BY_ID = Object.fromEntries(MUSCLES.map((m) => [m.id, m])) as Record<MuscleId, MuscleGroup>;

// Body outline: one side of the torso and leg, the head, and an arm.
export const BODY_FILL =
  "M120,62 L110,64 C109,76 107,85 100,90 C88,94 77,96 69,102 C64,112 66,124 72,134 C76,160 80,190 84,222 C82,240 76,252 74,266 C70,300 70,340 76,376 C78,392 76,404 74,418 C70,440 74,462 80,482 C80,492 74,500 72,506 C80,511 96,511 104,506 C106,498 104,488 102,478 C106,450 108,430 106,412 C104,398 104,388 106,378 C112,340 116,310 120,288 Z";
/** The same edge without the seam down the middle. */
export const BODY_EDGE =
  "M110,64 C109,76 107,85 100,90 C88,94 77,96 69,102 C64,112 66,124 72,134 C76,160 80,190 84,222 C82,240 76,252 74,266 C70,300 70,340 76,376 C78,392 76,404 74,418 C70,440 74,462 80,482 C80,492 74,500 72,506 C80,511 96,511 104,506 C106,498 104,488 102,478 C106,450 108,430 106,412 C104,398 104,388 106,378 C112,340 116,310 120,288";
export const ARM =
  "M70,100 C58,103 50,116 50,134 C48,160 46,180 46,200 C44,224 42,248 42,268 C40,280 38,292 40,302 C44,311 53,311 55,301 C56,291 56,281 56,270 C60,248 64,226 64,206 C66,186 68,166 70,146 C72,136 72,120 70,100 Z";
export const HEAD = { cx: 120, cy: 38, rx: 21, ry: 26 };
