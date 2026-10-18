import type { Settings } from "../settings";
import { ArmOpeners } from "./armOpeners";
import { BicepCurl } from "./bicepCurl";
import { HeelRaise } from "./heelRaise";
import { KneeExtension } from "./kneeExtension";
import { LateralRaise } from "./lateralRaise";
import { Marching } from "./marching";
import { OverheadPress } from "./overheadPress";
import { SideBend } from "./sideBend";
import { SingleLegStance } from "./singleLeg";
import { SitToStand } from "./sitToStand";
import { StandingStretches } from "./stretches";
import type { Routine, RoutineId, RoutineInfo } from "./types";
import { WalkOutAndBack } from "./walk";
import { WallPushup } from "./wallPushup";

/** Session order. To add a routine, implement `Routine` and register it here. */
export const ROUTINE_ORDER: RoutineId[] = [
  "sitToStand",
  "marching",
  "kneeExtension",
  "heelRaise",
  "walk",
  "singleLeg",
  "sideBend",
  "stretches",
  "lateralRaise",
  "bicepCurl",
  "overheadPress",
  "armOpeners",
  "wallPushup",
];

const FACTORIES: Record<RoutineId, (s: Settings) => Routine> = {
  sitToStand: (s) => new SitToStand(s),
  marching: (s) => new Marching(s),
  walk: (s) => new WalkOutAndBack(s),
  singleLeg: (s) => new SingleLegStance(s),
  stretches: (s) => new StandingStretches(s),
  kneeExtension: (s) => new KneeExtension(s),
  heelRaise: (s) => new HeelRaise(s),
  sideBend: (s) => new SideBend(s),
  lateralRaise: (s) => new LateralRaise(s),
  bicepCurl: (s) => new BicepCurl(s),
  overheadPress: (s) => new OverheadPress(s),
  armOpeners: (s) => new ArmOpeners(s),
  wallPushup: (s) => new WallPushup(s),
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
