// Daily progress per routine for the progress chart: each point is the best
// share of the routine's target reached that day (0-1), so every routine
// shares one 0-100% scale.

import { ROUTINE_ORDER } from "./routines/index";
import type { RoutineId } from "./routines/types";
import { dayKey, type SessionRecord } from "./storage";

export interface ProgressPoint {
  /** Local calendar day, e.g. "2026-10-17". */
  day: string;
  /** Best reps / target that day, clamped to 0-1. */
  value: number;
  reps: number;
  target: number;
}

export interface ProgressSeries {
  id: RoutineId;
  points: ProgressPoint[];
}

/** Days with any session (sorted), and one series per routine that has data, in session order. */
export function dailyProgress(sessions: SessionRecord[]): { days: string[]; series: ProgressSeries[] } {
  const best = new Map<string, ProgressPoint>();
  for (const s of sessions) {
    if (!(s.target > 0)) continue;
    const day = dayKey(new Date(s.finishedAt));
    const value = Math.min(1, Math.max(0, s.reps / s.target));
    const key = `${s.routineId}|${day}`;
    const prev = best.get(key);
    if (!prev || value > prev.value) best.set(key, { day, value, reps: s.reps, target: s.target });
  }
  const days = [...new Set([...best.values()].map((p) => p.day))].sort();
  const series = ROUTINE_ORDER.map((id) => ({
    id,
    points: days.flatMap((day) => best.get(`${id}|${day}`) ?? []),
  })).filter((s) => s.points.length > 0);
  return { days, series };
}
