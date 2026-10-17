import type { Settings } from "../settings";
import { Marching } from "./marching";
import { SingleLegStance } from "./singleLeg";
import { SitToStand } from "./sitToStand";
import { StandingStretches } from "./stretches";
import type { Routine, RoutineId, RoutineInfo } from "./types";
import { WalkOutAndBack } from "./walk";

/** Session order. To add a routine, implement `Routine` and register it here. */
export const ROUTINE_ORDER: RoutineId[] = ["sitToStand", "marching", "walk", "singleLeg", "stretches"];

const FACTORIES: Record<RoutineId, (s: Settings) => Routine> = {
  sitToStand: (s) => new SitToStand(s),
  marching: (s) => new Marching(s),
  walk: (s) => new WalkOutAndBack(s),
  singleLeg: (s) => new SingleLegStance(s),
  stretches: (s) => new StandingStretches(s),
};

export function createRoutine(id: RoutineId, settings: Settings): Routine {
  return FACTORIES[id](settings);
}

const infoCache = new Map<RoutineId, RoutineInfo>();
export function routineInfo(id: RoutineId, settings: Settings): RoutineInfo {
  if (!infoCache.has(id)) infoCache.set(id, createRoutine(id, settings).info);
  return infoCache.get(id)!;
}

export type { Routine, RoutineId, RoutineInfo } from "./types";
