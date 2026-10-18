"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { dailyProgress } from "@/lib/rehab/progress";
import { ROUTINE_ORDER, routineInfo } from "@/lib/rehab/routines/index";
import type { RoutineId } from "@/lib/rehab/routines/types";
import { SETTINGS } from "@/lib/rehab/settings";
import type { SessionRecord } from "@/lib/rehab/storage";

// Categorical slots 1-5, stepped for the dark card (#18181b); validated together
// (lightness band, chroma, colorblind and normal-vision separation, 3:1 contrast).
// A routine always keeps its slot, so its color never changes with what's shown.
const SERIES_COLOR: Record<RoutineId, string> = Object.fromEntries(
  ROUTINE_ORDER.map((id, i) => [id, ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"][i]]),
) as Record<RoutineId, string>;
const SURFACE = "#18181b";
const GRID = "#2c2c2a";
const MUTED = "#898781";
const CROSSHAIR = "#52514e";

const HEIGHT = 280;
const M = { top: 12, right: 16, bottom: 30, left: 44 };
const Y_TICKS = [0, 0.25, 0.5, 0.75, 1];

const name = (id: RoutineId) => routineInfo(id, SETTINGS).name;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** Local noon, so a day key never slips across midnight. */
const dayDate = (day: string) => new Date(`${day}T12:00:00`);
const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  dayDate(day).toLocaleDateString(undefined, opts);

/** Every exercise as one line: the share of its target reached, best try per day. */
export function ProgressChart({ sessions }: { sessions: SessionRecord[] }) {
  const { days, series } = useMemo(() => dailyProgress(sessions), [sessions]);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [table]);

  if (days.length === 0) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h2 className="text-xl font-semibold">Progress</h2>
        <p className="mt-2 text-base text-zinc-400">Finish an exercise to see your progress here.</p>
      </section>
    );
  }

  // x: real calendar time, so gaps between sessions look like gaps.
  const first = dayDate(days[0]).getTime();
  const last = dayDate(days.at(-1)!).getTime();
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (day: string) => M.left + (last === first ? plotW / 2 : ((dayDate(day).getTime() - first) / (last - first)) * plotW);
  const y = (v: number) => M.top + (1 - v) * plotH;
  const xTicks = days.length <= 6 ? days : Array.from({ length: 6 }, (_, i) => days[Math.round((i * (days.length - 1)) / 5)]);

  const nearest = (px: number) => {
    let best = 0;
    for (let i = 1; i < days.length; i++) if (Math.abs(x(days[i]) - px) < Math.abs(x(days[best]) - px)) best = i;
    return best;
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setHover(nearest(e.clientX - rect.left));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const step = e.key === "ArrowRight" ? 1 : -1;
      setHover((h) => Math.min(days.length - 1, Math.max(0, (h ?? (step > 0 ? -1 : days.length)) + step)));
    } else if (e.key === "Escape") setHover(null);
  };

  const hoverDay = hover === null ? null : days[hover];
  const tipLeft = hoverDay ? x(hoverDay) : 0;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Progress</h2>
          <p className="text-sm text-zinc-400">Share of each exercise&apos;s target reached, best try each day</p>
        </div>
        <button
          onClick={() => setTable((t) => !t)}
          aria-pressed={table}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-lime-400"
        >
          {table ? "Show chart" : "Show table"}
        </button>
      </header>

      {/* Legend: a line key beside each name; the text stays in text colors. */}
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-300">
        {series.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <svg width="16" height="8" aria-hidden>
              <line x1="0" y1="4" x2="16" y2="4" stroke={SERIES_COLOR[s.id]} strokeWidth="2" strokeLinecap="round" />
            </svg>
            {name(s.id)}
          </li>
        ))}
      </ul>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="py-2 pr-4 font-semibold">Day</th>
                {series.map((s) => (
                  <th key={s.id} className="py-2 pr-4 font-semibold">{name(s.id)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200 tabular-nums">
              {days.map((day) => (
                <tr key={day}>
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtDay(day, { weekday: "short", month: "short", day: "numeric" })}</td>
                  {series.map((s) => {
                    const p = s.points.find((pt) => pt.day === day);
                    return (
                      <td key={s.id} className="py-2 pr-4 whitespace-nowrap">
                        {p ? `${pct(p.value)} (${p.reps} of ${p.target})` : <span className="text-zinc-600">–</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative">
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-label="Progress chart. Use the left and right arrow keys to read each day; Show table lists every value."
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
            className="block rounded-lg focus-visible:outline-2 focus-visible:outline-lime-400"
          >
            {/* Recessive hairline grid and y-axis labels. */}
            {Y_TICKS.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
                <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="12" fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                  {pct(t)}
                </text>
              </g>
            ))}
            {xTicks.map((day, i) => (
              <text
                key={`${day}-${i}`}
                x={x(day)}
                y={HEIGHT - 8}
                textAnchor={days.length > 1 && i === 0 ? "start" : days.length > 1 && i === xTicks.length - 1 ? "end" : "middle"}
                fontSize="12"
                fill={MUTED}
              >
                {fmtDay(day)}
              </text>
            ))}

            {hoverDay ? <line x1={tipLeft} x2={tipLeft} y1={M.top} y2={M.top + plotH} stroke={CROSSHAIR} strokeWidth="1" /> : null}

            {series.map((s) => (
              <g key={s.id}>
                {s.points.length > 1 ? (
                  <polyline
                    points={s.points.map((p) => `${x(p.day)},${y(p.value)}`).join(" ")}
                    fill="none"
                    stroke={SERIES_COLOR[s.id]}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ) : null}
                {s.points.map((p) => (
                  <circle
                    key={p.day}
                    cx={x(p.day)}
                    cy={y(p.value)}
                    r={p.day === hoverDay ? 5.5 : 4}
                    fill={SERIES_COLOR[s.id]}
                    stroke={SURFACE}
                    strokeWidth="2"
                  />
                ))}
              </g>
            ))}

            {/* Hit area: the whole plot, so the pointer only has to be near a day. */}
            <rect
              x={M.left}
              y={M.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {hoverDay ? (
            <div
              role="status"
              className="pointer-events-none absolute top-2 z-10 w-56 rounded-xl border border-zinc-700 bg-zinc-950/95 p-3 text-sm shadow-xl"
              style={tipLeft > width / 2 ? { right: width - tipLeft + 12 } : { left: tipLeft + 12 }}
            >
              <p className="mb-2 font-semibold text-zinc-300">{fmtDay(hoverDay, { weekday: "long", month: "short", day: "numeric" })}</p>
              <ul className="flex flex-col gap-1.5">
                {series.map((s) => {
                  const p = s.points.find((pt) => pt.day === hoverDay);
                  return (
                    <li key={s.id} className="flex items-center gap-2">
                      <svg width="12" height="8" aria-hidden className="shrink-0">
                        <line x1="0" y1="4" x2="12" y2="4" stroke={SERIES_COLOR[s.id]} strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <span className="w-10 shrink-0 font-semibold text-white tabular-nums">{p ? pct(p.value) : "–"}</span>
                      <span className="truncate text-zinc-400">{name(s.id)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
