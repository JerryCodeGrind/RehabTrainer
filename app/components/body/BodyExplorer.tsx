"use client";

import { Play, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CarePlan } from "@/lib/rehab/plan";
import { routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import type { SessionRecord } from "@/lib/rehab/storage";
import { Expander } from "../motion/Expander";
import { BTN_TERTIARY } from "../rehab/ui";
import { ARM, BODY_EDGE, BODY_FILL, HEAD, MUSCLE_BY_ID, MUSCLES, type MuscleGroup, type MuscleId, type View } from "./anatomy";

type Highlight = "plan" | "recent" | "off";
const RECENT_DAYS = 30;
const MIRROR = "translate(240 0) scale(-1 1)";
const AREAS: MuscleGroup["area"][] = ["upper body", "trunk", "hips and legs"];

const nameOf = (id: RoutineId) => routineInfo(id, SETTINGS).name;

// Fills per state. Calm by default: neutral muscle tone, colour only where it means something.
const FILL = {
  base: "#e3e8e1",
  plan: "#d6e4f7",
  recent: "#d5e6cf",
  hover: "#b9d0f2",
  selected: "#28536b",
};

interface Tip {
  id: MuscleId;
  x: number;
  y: number;
  via: "pointer" | "focus";
}

/**
 * The "my body" explorer: a front/back anatomical figure with selectable
 * muscle groups. Hover previews, click or tap selects, and a list offers the
 * same selection for keyboards and small touch targets. Colours only reflect
 * what the app actually knows: whether today's plan includes an exercise that
 * commonly works a group, and whether related exercises were done recently.
 */
export function BodyExplorer({
  plan,
  sessions,
  onOpenRoutine,
}: {
  plan: CarePlan | null;
  sessions: SessionRecord[];
  onOpenRoutine: (id: RoutineId) => void;
}) {
  const [view, setView] = useState<View>("front");
  const [selected, setSelected] = useState<MuscleId | null>(null);
  const [highlight, setHighlight] = useState<Highlight>(plan?.routines.length ? "plan" : "off");
  const [tip, setTip] = useState<Tip | null>(null);
  const [announce, setAnnounce] = useState("");
  const frameRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planSet = useMemo(() => new Set(plan?.routines ?? []), [plan]);
  // "Now" is fixed for the visit, so the recent window doesn't shift between renders.
  const [now] = useState(() => Date.now());
  const recent = useMemo(() => {
    const since = now - RECENT_DAYS * 86_400_000;
    return sessions.filter((s) => new Date(s.finishedAt).getTime() >= since);
  }, [sessions, now]);

  const stateOf = (m: MuscleGroup) => ({
    inPlan: m.exercises.some((e) => planSet.has(e.id)),
    recentCount: recent.filter((s) => m.exercises.some((e) => e.id === s.routineId)).length,
  });

  useEffect(() => () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
  }, []);

  const select = (id: MuscleId | null) => {
    setSelected(id);
    setAnnounce(id ? `${MUSCLE_BY_ID[id].name} selected` : "selection cleared");
  };

  const switchView = (next: View) => {
    if (next === view) return;
    setView(next);
    setTip(null);
    if (selected && !MUSCLE_BY_ID[selected].paths[next]) {
      setSelected(null);
      setAnnounce(`${MUSCLE_BY_ID[selected].name} isn't visible from the ${next}, so the selection was cleared.`);
    }
  };

  /** Selecting from the list jumps to a view where the group is visible. */
  const selectFromList = (id: MuscleId) => {
    const m = MUSCLE_BY_ID[id];
    if (!m.paths[view]) setView(m.paths.front ? "front" : "back");
    select(id);
  };

  const placeTip = (el: Element, id: MuscleId, via: Tip["via"]) => {
    const frame = frameRef.current;
    if (!frame) return;
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const x = Math.min(Math.max(r.left + r.width / 2 - f.left, 96), f.width - 96);
    const y = Math.max(r.top - f.top - 8, 40);
    setTip({ id, x, y, via });
  };

  const onEnter = (e: PointerEvent<SVGPathElement>, id: MuscleId) => {
    // Touch has no hover: a tap selects instead.
    if (e.pointerType === "touch") return;
    const el = e.currentTarget;
    if (tipTimer.current) clearTimeout(tipTimer.current);
    // Show at once when moving between regions; after a short pause otherwise, to avoid flicker.
    if (tip) placeTip(el, id, "pointer");
    else tipTimer.current = setTimeout(() => placeTip(el, id, "pointer"), 110);
  };
  const onLeave = () => {
    if (tipTimer.current) clearTimeout(tipTimer.current);
    tipTimer.current = setTimeout(() => setTip(null), 60);
  };
  const onKey = (e: KeyboardEvent<SVGGElement>, id: MuscleId) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select(id);
    } else if (e.key === "Escape") {
      select(null);
    }
  };

  const visible = MUSCLES.filter((m) => m.paths[view]);
  const sel = selected ? MUSCLE_BY_ID[selected] : null;
  const tipMuscle = tip ? MUSCLE_BY_ID[tip.id] : null;

  const fillFor = (m: MuscleGroup) => {
    if (m.id === selected) return FILL.selected;
    if (tip?.id === m.id) return FILL.hover;
    const s = stateOf(m);
    if (highlight === "plan" && s.inPlan) return FILL.plan;
    if (highlight === "recent" && s.recentCount > 0) return FILL.recent;
    return FILL.base;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] lg:gap-8">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {/* Figure */}
      <section aria-label="body figure" className="flex flex-col rounded-[var(--radius-panel)] border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Segmented
            label="view"
            value={view}
            onChange={(v) => switchView(v as View)}
            options={[
              { value: "front", label: "front" },
              { value: "back", label: "back" },
            ]}
          />
          <Segmented
            label="highlight"
            value={highlight}
            onChange={(v) => setHighlight(v as Highlight)}
            options={[
              { value: "plan", label: "today's plan", disabled: !plan?.routines.length },
              { value: "recent", label: `last ${RECENT_DAYS} days` },
              { value: "off", label: "off" },
            ]}
          />
        </div>

        <div ref={frameRef} className="relative flex justify-center px-4 pt-6 pb-4" onPointerLeave={onLeave}>
          <svg
            viewBox="0 0 240 520"
            className="h-[min(64svh,560px)] w-auto touch-manipulation select-none"
            role="group"
            aria-label={`${view} view. ${visible.length} selectable muscle groups.`}
          >
            {/* Body: fill first, then the edge without a seam down the middle. */}
            <g aria-hidden fill="#f1f4ef">
              <ellipse {...HEAD} />
              <path d={BODY_FILL} />
              <path d={BODY_FILL} transform={MIRROR} />
              <path d={ARM} />
              <path d={ARM} transform={MIRROR} />
            </g>
            <g aria-hidden fill="none" stroke="#b7c2bb" strokeWidth="1" strokeLinejoin="round">
              <ellipse {...HEAD} />
              <path d={BODY_EDGE} />
              <path d={BODY_EDGE} transform={MIRROR} />
              <path d={ARM} />
              <path d={ARM} transform={MIRROR} />
            </g>
            {view === "back" ? (
              <path aria-hidden d="M120,90 L120,250" stroke="#cdd5cf" strokeWidth="1" strokeDasharray="2 3" />
            ) : null}

            {visible.map((m) => {
              const isSel = m.id === selected;
              const fill = fillFor(m);
              const style = {
                fill,
                fillOpacity: isSel ? 0.78 : 1,
                stroke: isSel ? "#28536b" : "#c3cdc6",
                strokeWidth: isSel ? 1.2 : 0.8,
                transition: "fill 200ms, stroke 200ms, fill-opacity 200ms",
              };
              return (
                <g
                  key={m.id}
                  role="button"
                  tabIndex={0}
                  aria-label={m.name}
                  aria-pressed={isSel}
                  className="cursor-pointer outline-none [&:focus-visible>path]:stroke-sky [&:focus-visible>path]:[stroke-width:2]"
                  onClick={() => select(isSel ? null : m.id)}
                  onKeyDown={(e) => onKey(e, m.id)}
                  onFocus={(e) => placeTip(e.currentTarget, m.id, "focus")}
                  onBlur={() => setTip(null)}
                >
                  {m.paths[view]!.flatMap((d, i) => [
                    <path key={`${i}a`} d={d} style={style} onPointerEnter={(e) => onEnter(e, m.id)} onPointerLeave={onLeave} />,
                    <path key={`${i}b`} d={d} transform={MIRROR} style={style} onPointerEnter={(e) => onEnter(e, m.id)} onPointerLeave={onLeave} />,
                  ])}
                  {m.details?.[view] ? (
                    <g aria-hidden pointerEvents="none" stroke={isSel ? "#ffffff" : "#c3cdc6"} strokeOpacity={isSel ? 0.5 : 1} strokeWidth="0.7">
                      <path d={m.details[view]} />
                      <path d={m.details[view]} transform={MIRROR} />
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {tip && tipMuscle ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 max-w-48 -translate-x-1/2 -translate-y-full animate-fade-in rounded-[var(--radius-control)] border border-line bg-surface px-3 py-2 shadow-[var(--shadow-float)]"
              style={{ left: tip.x, top: tip.y }}
            >
              <p className="text-sm font-semibold text-ink">{tipMuscle.name}</p>
              <p className="text-xs text-ink-2">{tip.via === "focus" ? "press enter to select" : tip.id === selected ? "selected" : "click to select"}</p>
            </div>
          ) : null}
        </div>

        <Legend highlight={highlight} />
      </section>

      {/* Details */}
      <div className="flex flex-col gap-6">
        <section aria-label="muscle group details" aria-live="polite" className="rounded-[var(--radius-panel)] border border-line bg-surface p-5 sm:p-6">
          {sel ? (
            <Details
              muscle={sel}
              inPlan={planSet}
              recent={recent}
              onClear={() => select(null)}
              onOpenRoutine={onOpenRoutine}
            />
          ) : (
            <p className="py-6 text-center text-base text-ink-3">tap a muscle</p>
          )}
        </section>

        <div className="border-t border-line">
          <Expander label="all muscles">
            <div className="flex flex-col gap-4">
          {AREAS.map((area) => (
                <div key={area} className="flex flex-col gap-1.5">
                  <p className="text-xs text-ink-3">{area}</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {MUSCLES.filter((m) => m.area === area).map((m) => {
                      const on = m.id === selected;
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => selectFromList(m.id)}
                            aria-pressed={on}
                            className={`min-h-9 rounded-full border px-3 text-sm transition-colors duration-150 ${
                              on ? "border-brand bg-brand text-white" : "border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink"
                            }`}
                          >
                            {m.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Expander>
        </div>
      </div>
    </div>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-button)] bg-bg-2 p-1">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={`min-h-9 rounded-[var(--radius-control)] px-3 text-sm transition-colors duration-150 disabled:cursor-not-allowed disabled:text-ink-3/60 ${
              on ? "bg-surface font-semibold text-ink shadow-[0_1px_2px_rgb(35_50_58/0.1)]" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend({ highlight }: { highlight: Highlight }) {
  const items =
    highlight === "plan"
      ? [{ fill: FILL.plan, text: "in plan" }]
      : highlight === "recent"
        ? [{ fill: FILL.recent, text: "recent" }]
        : [];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-ink-2">
      {items.map((i) => (
        <span key={i.text} className="flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-[3px] border border-line-strong" style={{ background: i.fill }} />
          {i.text}
        </span>
      ))}
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-3 w-3 rounded-[3px] bg-brand" />
        selected
      </span>
    </div>
  );
}

function Details({
  muscle,
  inPlan,
  recent,
  onClear,
  onOpenRoutine,
}: {
  muscle: MuscleGroup;
  inPlan: Set<RoutineId>;
  recent: SessionRecord[];
  onClear: () => void;
  onOpenRoutine: (id: RoutineId) => void;
}) {
  return (
    <div className="flex animate-fade-in flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-section font-semibold tracking-tight text-ink">{muscle.name}</h2>
          <p className="text-base text-ink-2">{muscle.location}</p>
        </div>
        <button type="button" onClick={onClear} aria-label="clear selection" className={`${BTN_TERTIARY} -mr-2 h-10 w-10 px-0`}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {muscle.exercises.length ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-3">exercises</p>
          <ul className="-mx-2 flex flex-col">
            {muscle.exercises.map((e, i) => {
              const count = recent.filter((s) => s.routineId === e.id).length;
              return (
                <li key={e.id} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    type="button"
                    onClick={() => onOpenRoutine(e.id)}
                    className="press group flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-button)] px-2 text-left hover:bg-bg hover:shadow-none"
                  >
                    <span className="flex flex-1 items-center gap-2 text-base font-semibold text-ink">
                      {nameOf(e.id)}
                      {inPlan.has(e.id) ? <span className="h-2 w-2 rounded-full bg-sky" aria-label="in today's plan" /> : null}
                    </span>
                    {count ? (
                      <span className="num text-sm text-ink-3" aria-label={`${count} in the last ${RECENT_DAYS} days`}>
                        {count}×
                      </span>
                    ) : null}
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-bg-2 text-ink transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="rounded-[var(--radius-control)] bg-bg px-4 py-3 text-sm leading-relaxed text-ink-2">
          no exercises for this area
        </p>
      )}

      <p className="text-xs leading-relaxed text-ink-3">
        general exercise info, not an assessment.
      </p>
    </div>
  );
}
