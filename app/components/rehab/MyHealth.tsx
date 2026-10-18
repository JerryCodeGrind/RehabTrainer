"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  bodyHealth,
  GROUPS,
  muscleId,
  needsWork,
  strongestMuscle,
  type Group,
  type Level,
  type MuscleHealth,
  type MuscleId,
  type Side,
} from "@/lib/rehab/health";
import { planStore } from "@/lib/rehab/plan";
import { routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import { sessionStore } from "@/lib/rehab/storage";
import { BTN_PRIMARY } from "./ui";

// Score colors (validated for color-blind separation on the dark stage):
// rose = needs work, amber = getting there, teal = strong. Every color also
// comes with a text label, so nothing relies on color alone.
const WEAK = "#fb7185";
const FAIR = "#fbbf24";
const GOOD = "#2dd4bf";
const HOLO = "#67e8f9";
const UNTRACKED_LINE = "#64748b";

const LEVEL_LABEL: Record<Level, string> = { good: "Strong", fair: "Getting there", weak: "Needs work", none: "No data yet" };

/** Score color, graded continuously; capped by level so a flagged weaker side never looks strong. */
function colorFor(m: MuscleHealth): string | null {
  if (m.score === null) return null;
  const s = m.level === "fair" ? Math.min(m.score, 0.7) : m.level === "weak" ? Math.min(m.score, 0.48) : m.score;
  const mix = (a: string, b: string, t: number) => `color-mix(in oklab, ${b} ${Math.round(Math.max(0, Math.min(1, t)) * 100)}%, ${a})`;
  if (s <= 0.3) return WEAK;
  if (s < 0.62) return mix(WEAK, FAIR, (s - 0.3) / 0.32);
  if (s < 0.85) return mix(FAIR, GOOD, (s - 0.62) / 0.23);
  return GOOD;
}

// Figures are drawn in a 200 × 470 box. Shapes are drawn on the viewer's left
// and mirrored for the other side, unless `center`. Front view: the viewer's
// left is the person's right; back view: the person's left.
type Shape = { group: Group; d: string; center?: boolean };
const ARM: Shape[] = [
  { group: "shoulders", d: "M74 82 Q56 84 51 98 Q48 110 50 122 Q58 116 62 110 Q66 96 76 90 Z" },
  { group: "arms", d: "M50 128 Q46 150 45 176 L55 178 Q58 152 58 132 Z" },
  { group: "arms", d: "M44 184 Q38 220 33 256 L42 258 Q48 222 54 186 Z" },
];
const FRONT: Shape[] = [
  ...ARM,
  { group: "chest", d: "M78 88 Q90 84 99 86 L99 124 Q86 130 72 122 Q66 108 70 96 Q72 90 78 88 Z" },
  { group: "core", center: true, d: "M88 130 Q100 127 112 130 L113 204 Q100 210 87 204 Z" },
  { group: "core", d: "M68 130 Q78 134 84 134 L83 202 Q74 198 70 188 Q66 160 68 130 Z" },
  { group: "hipFlexors", d: "M68 214 Q82 220 97 224 L94 248 Q82 246 72 238 Q67 226 68 214 Z" },
  { group: "quads", d: "M68 252 Q80 258 95 258 Q98 280 95 304 Q91 324 86 330 Q76 328 72 320 Q66 292 68 252 Z" },
  { group: "calves", d: "M74 344 Q82 348 92 344 Q92 380 88 412 L79 412 Q74 380 74 344 Z" },
];
const BACK: Shape[] = [
  ...ARM,
  { group: "upperBack", center: true, d: "M86 70 Q100 66 114 70 L128 84 Q114 98 100 102 Q86 98 72 84 Z" },
  { group: "upperBack", d: "M66 104 Q80 110 96 114 L95 160 Q82 168 70 160 Q64 132 66 104 Z" },
  { group: "core", center: true, d: "M86 166 Q100 162 114 166 L115 204 Q100 210 85 204 Z" },
  { group: "abductors", d: "M66 206 Q76 202 86 208 L86 226 Q76 228 66 224 Q64 214 66 206 Z" },
  { group: "glutes", d: "M68 230 Q84 230 98 232 L98 264 Q84 272 72 264 Q64 248 68 230 Z" },
  { group: "hamstrings", d: "M70 272 Q84 276 96 274 Q98 302 94 326 Q84 332 76 326 Q68 300 70 272 Z" },
  { group: "calves", d: "M73 338 Q82 333 92 338 Q96 362 90 386 Q82 392 77 386 Q69 362 73 338 Z" },
  { group: "calves", d: "M79 392 L88 392 L87 418 L80 418 Z" },
];
// Half the body outline, from the neck down the outside and back up to the crotch.
const HALF_BODY =
  "M100 64 C92 64 90 68 89 74 L74 80 Q56 84 50 98 Q44 112 42 140 L36 190 Q30 230 26 262 Q22 276 28 282 Q34 284 38 274 L44 236 Q50 210 52 188 L58 140 Q60 128 62 124 Q64 170 66 206 Q62 228 64 250 Q64 300 68 332 Q70 380 74 418 Q70 436 72 444 L94 444 Q96 436 92 420 Q96 380 96 340 Q100 300 100 252";
const MIRROR = "matrix(-1 0 0 1 200 0)";

/** Holographic muscle map: each muscle graded by recent exercise results, with
 * what it does and how to improve it on hover or tap. `onStartRoutine` adds a
 * Start button for exercises in today's plan. */
export function MyHealth({ onStartRoutine }: { onStartRoutine?: (id: RoutineId) => void } = {}) {
  const sessions = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const plan = useSyncExternalStore(planStore.subscribe, planStore.getSnapshot, planStore.getServerSnapshot);
  const muscles = useMemo(() => bodyHealth(sessions), [sessions]);
  const byId = useMemo(() => new Map(muscles.map((m) => [m.id, m])), [muscles]);
  const strongest = strongestMuscle(muscles);
  const work = needsWork(muscles);
  const [selected, setSelected] = useState<MuscleId | null>(() => work[0]?.id ?? strongest?.id ?? null);
  const [hovered, setHovered] = useState<MuscleId | null>(null);
  const shownId = hovered ?? selected;
  const shown = shownId ? (byId.get(shownId) ?? null) : null;
  const anyData = muscles.some((m) => m.score !== null);

  const figure = (view: "front" | "back") => {
    const shapes = view === "front" ? FRONT : BACK;
    // Which side the unmirrored (viewer's left) shapes belong to.
    const leftSide: Side = view === "front" ? "right" : "left";
    const rightSide: Side = leftSide === "left" ? "right" : "left";
    const drawn = shapes.flatMap((s, i) =>
      s.center
        ? [{ key: `${i}`, id: muscleId(s.group, "left"), d: s.d, mirror: false }]
        : [
            { key: `${i}a`, id: muscleId(s.group, leftSide), d: s.d, mirror: false },
            { key: `${i}b`, id: muscleId(s.group, rightSide), d: s.d, mirror: true },
          ],
    );
    return (
      <figure className="flex flex-1 flex-col items-center">
        <svg viewBox="0 0 200 470" className="h-auto w-full max-w-[15rem] overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`beam-${view}`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor={HOLO} stopOpacity="0.22" />
              <stop offset="1" stopColor={HOLO} stopOpacity="0" />
            </linearGradient>
            <radialGradient id={`pad-${view}`}>
              <stop offset="0" stopColor={HOLO} stopOpacity="0.7" />
              <stop offset="1" stopColor={HOLO} stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Projector pad and its beam. */}
          <path d="M40 456 L160 456 L136 10 L64 10 Z" fill={`url(#beam-${view})`} />
          <ellipse cx="100" cy="456" rx="70" ry="10" fill={`url(#pad-${view})`} />
          <ellipse cx="100" cy="456" rx="56" ry="6" fill="none" stroke={HOLO} strokeOpacity="0.6" />
          <g className="motion-safe:animate-holo-float">
            {/* Body outline, faintly filled. */}
            <ellipse cx="100" cy="38" rx="20" ry="25" fill={HOLO} fillOpacity="0.06" stroke={HOLO} strokeOpacity="0.7" strokeWidth="1.2" />
            {[false, true].map((mirror) => (
              <g key={String(mirror)} transform={mirror ? MIRROR : undefined}>
                <path d={`${HALF_BODY} L100 64 Z`} fill={HOLO} fillOpacity="0.05" />
                <path d={HALF_BODY} fill="none" stroke={HOLO} strokeOpacity="0.7" strokeWidth="1.2" strokeLinejoin="round" />
              </g>
            ))}
            {drawn.map(({ key, id, d, mirror }) => {
              const m = byId.get(id)!;
              const color = colorFor(m);
              const active = shown?.id === id;
              // Only hovering dims the rest; a tapped muscle just gets the white outline.
              const dim = hovered !== null && hovered !== id;
              return (
                <path
                  key={key}
                  d={d}
                  transform={mirror ? MIRROR : undefined}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(id)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => setSelected(id)}
                  className="cursor-pointer transition-[opacity,stroke-width] duration-200"
                  style={{
                    fill: color ?? "transparent",
                    fillOpacity: color ? (active ? 1 : 0.85) : 0,
                    stroke: active ? "#ffffff" : (color ?? UNTRACKED_LINE),
                    strokeWidth: active ? 2.5 : 1,
                    strokeOpacity: color || active ? 1 : 0.8,
                    opacity: dim ? 0.35 : 1,
                    filter: color ? `drop-shadow(0 0 ${active ? 8 : 4}px ${color})` : undefined,
                  }}
                />
              );
            })}
          </g>
          <text x="6" y="16" className="fill-cyan-200 text-[13px] font-bold">{view === "front" ? "R" : "L"}</text>
          <text x="194" y="16" textAnchor="end" className="fill-cyan-200 text-[13px] font-bold">{view === "front" ? "L" : "R"}</text>
        </svg>
        <figcaption className="mt-1 text-base font-semibold tracking-widest text-cyan-200 uppercase">{view}</figcaption>
      </figure>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <p className="text-2xl text-zinc-300">
        {anyData ? (
          <>
            {strongest ? (
              <>
                Strongest: <span className="font-semibold text-white">{strongest.name.toLowerCase()}</span>.{" "}
              </>
            ) : null}
            {work.length ? (
              <>
                Focus on: <span className="font-semibold text-white">{work.slice(0, 3).map((m) => m.name.toLowerCase()).join(", ")}</span>
                {work.length > 3 ? ` and ${work.length - 3} more` : ""}.
              </>
            ) : (
              "Everything you've worked recently is in good shape."
            )}
          </>
        ) : (
          "Finish a few exercises and your muscle map lights up here."
        )}
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {/* The hologram stage. */}
          <div
            className="relative overflow-hidden rounded-3xl border border-cyan-400/20 bg-zinc-950 px-2 pt-6 pb-4"
            style={{
              backgroundImage: `radial-gradient(ellipse at 50% 85%, rgba(34,211,238,0.14), transparent 60%),
                linear-gradient(rgba(103,232,249,0.06) 1px, transparent 1px),
                linear-gradient(90deg, rgba(103,232,249,0.06) 1px, transparent 1px)`,
              backgroundSize: "100% 100%, 28px 28px, 28px 28px",
            }}
            onPointerLeave={() => setHovered(null)}
          >
            <div className="flex justify-center gap-2 sm:gap-8">
              {figure("front")}
              {figure("back")}
            </div>
            {/* Scanlines and a sweeping scan bar. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: "repeating-linear-gradient(transparent 0 3px, rgba(103,232,249,0.04) 3px 4px)" }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 hidden h-16 -translate-y-full motion-safe:block motion-safe:animate-holo-scan"
              style={{ background: "linear-gradient(transparent, rgba(103,232,249,0.12), transparent)" }}
            />
          </div>
          <Legend />
        </div>

        <Details muscle={shown} plan={plan?.routines ?? null} onStartRoutine={onStartRoutine} />
      </div>

      <MuscleList muscles={muscles} selected={selected} onSelect={setSelected} />

      <p className="text-base text-zinc-500">
        From your exercise tracking over the last 30 days. This isn&apos;t a medical assessment; talk to your care team about any changes.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-col gap-2 px-1">
      <div className="h-3 rounded-full" style={{ background: `linear-gradient(90deg, ${WEAK}, ${FAIR}, ${GOOD})` }} aria-hidden />
      <div className="flex justify-between text-base text-zinc-300">
        <span>Needs work</span>
        <span>Getting there</span>
        <span>Strong</span>
      </div>
      <p className="flex items-center gap-2 text-base text-zinc-400">
        <span aria-hidden className="inline-block h-4 w-6 rounded border" style={{ borderColor: UNTRACKED_LINE }} />
        Outline only: not tracked by your exercises yet
      </p>
    </div>
  );
}

/** What the hovered or selected muscle is doing, and how to improve it. */
function Details({
  muscle: m,
  plan,
  onStartRoutine,
}: {
  muscle: MuscleHealth | null;
  plan: RoutineId[] | null;
  onStartRoutine?: (id: RoutineId) => void;
}) {
  if (!m) {
    return (
      <aside className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-xl text-zinc-300">
        Hover over or tap a muscle to see how it&apos;s doing and how to improve it.
      </aside>
    );
  }
  const info = GROUPS[m.group];
  const color = colorFor(m);
  return (
    <aside aria-live="polite" className="flex flex-col gap-4 rounded-3xl border border-zinc-800 bg-zinc-900 p-6 lg:sticky lg:top-6">
      <div>
        <h3 className="text-3xl font-bold">{m.name}</h3>
        <p className="mt-1 text-lg text-zinc-400">{info.role}</p>
      </div>

      {m.score !== null ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold">
              {LEVEL_LABEL[m.level]}
              {m.trend === "up" ? " ↑" : m.trend === "down" ? " ↓" : ""}
            </span>
            <span className="text-lg text-zinc-400 tabular-nums">{Math.round(m.score * 100)} / 100</span>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-zinc-800"
            role="meter"
            aria-label="Score"
            aria-valuenow={Math.round(m.score * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full" style={{ width: `${m.score * 100}%`, background: color ?? undefined }} />
          </div>
        </div>
      ) : (
        <p className="text-2xl font-semibold text-zinc-300">{m.tracked ? "No data yet" : "Not tracked yet"}</p>
      )}

      <ul className="flex flex-col gap-1 text-lg text-zinc-300">
        {m.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      {m.tracked ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-zinc-950 p-4">
          <p className="text-sm font-bold tracking-widest text-cyan-200 uppercase">How to improve</p>
          <p className="text-lg">{info.tip}</p>
          <ul className="flex flex-col gap-2">
            {info.routines.map((id) => {
              const inPlan = plan?.includes(id) ?? false;
              return (
                <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{routineInfo(id, SETTINGS).name}</span>
                  {inPlan && onStartRoutine ? (
                    <button onClick={() => onStartRoutine(id)} className={`${BTN_PRIMARY} min-h-12! px-5! text-lg!`}>
                      Start
                    </button>
                  ) : (
                    <span className="text-base text-zinc-400">{inPlan ? "In today's plan" : "Not in your plan"}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {info.routines.some((id) => !(plan?.includes(id) ?? false)) ? (
            <p className="text-base text-zinc-400">Check with your care team before adding exercises that aren&apos;t in your plan.</p>
          ) : null}
        </div>
      ) : (
        <p className="text-lg text-zinc-400">None of your exercises work this area yet. Ask your care team about exercises for it.</p>
      )}
    </aside>
  );
}

/** Every muscle as a list (the accessible way to browse the map): needs work first, untracked last. */
function MuscleList({ muscles, selected, onSelect }: { muscles: MuscleHealth[]; selected: MuscleId | null; onSelect: (id: MuscleId) => void }) {
  const scored = muscles.filter((m) => m.score !== null).sort((a, b) => a.score! - b.score!);
  const unscored = muscles.filter((m) => m.score === null);
  return (
    <section aria-labelledby="all-muscles" className="flex flex-col gap-3">
      <h3 id="all-muscles" className="text-2xl font-bold">All muscles</h3>
      <ul className="grid gap-2 sm:grid-cols-2">
        {[...scored, ...unscored].map((m) => {
          const color = colorFor(m);
          const isSelected = selected === m.id;
          return (
            <li key={m.id}>
              <button
                onClick={() => onSelect(m.id)}
                aria-pressed={isSelected}
                className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-2 text-left transition-colors hover:bg-zinc-800 focus-visible:outline-4 focus-visible:outline-lime-400 ${
                  isSelected ? "border-white bg-zinc-800" : "border-transparent bg-zinc-900"
                }`}
              >
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-full border"
                  style={{ background: color ?? "transparent", borderColor: color ?? UNTRACKED_LINE }}
                />
                <span className="flex-1 text-lg font-semibold">{m.name}</span>
                <span className="text-base text-zinc-300">
                  {m.score !== null ? `${LEVEL_LABEL[m.level]} · ${Math.round(m.score * 100)}` : m.tracked ? "No data yet" : "Not tracked"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
