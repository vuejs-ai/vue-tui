import type { CapacityJourneyId, CapacityVolume } from "./workloads.tsx";

export interface CapacityRunSpec {
  readonly journey: CapacityJourneyId;
  readonly volume?: CapacityVolume;
}

export const capacityRunSpecs: readonly CapacityRunSpec[] = Object.freeze([
  ...(["j1", "j2", "j3", "j4", "j5"] as const).map((journey) => Object.freeze({ journey })),
  Object.freeze({ journey: "j6i", volume: "small" }),
  Object.freeze({ journey: "j6i", volume: "large" }),
  Object.freeze({ journey: "j6f", volume: "small" }),
  Object.freeze({ journey: "j6f", volume: "large" }),
]);

const capacityJourneyIds = new Set<CapacityJourneyId>(["j1", "j2", "j3", "j4", "j5", "j6i", "j6f"]);

export function selectCapacityRunSpecs(argument?: string): readonly CapacityRunSpec[] {
  if (argument === undefined) return capacityRunSpecs;
  const requested = argument.split(",");
  if (requested.length === 0 || requested.some((journey) => journey === "")) {
    throw new TypeError("--journeys must contain one or more comma-separated journey IDs");
  }
  for (const journey of requested) {
    if (!capacityJourneyIds.has(journey as CapacityJourneyId)) {
      throw new TypeError(`unknown capacity journey: ${journey}`);
    }
  }
  const selected = new Set(requested as CapacityJourneyId[]);
  return Object.freeze(capacityRunSpecs.filter((spec) => selected.has(spec.journey)));
}
