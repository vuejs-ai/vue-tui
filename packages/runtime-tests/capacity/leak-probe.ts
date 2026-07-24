import { queryObjects } from "node:v8";

export const capacityLeakTargetKinds = [
  "tui-app",
  "root-proxy",
  "vue-root-instance",
  "vue-app-context",
  "tui-root",
  "runtime-app-context",
  "stdin",
  "stdout",
  "stderr",
  "host-node",
] as const;

export type CapacityLeakTargetKind = (typeof capacityLeakTargetKinds)[number];

export interface CapacityLeakProbeCalibration {
  readonly basis: "v8-query-objects-weakmap-witness";
  readonly baselineWitnesses: number;
  readonly releasedWitnesses: number;
  readonly retainedWitnesses: number;
  readonly witnessesAfterRelease: number;
  readonly releasedWeakReferenceCleared: boolean;
  readonly retainedWeakReferenceObserved: boolean;
  readonly retainedWeakReferenceCleared: boolean;
  readonly valid: boolean;
}

export interface CapacityLeakCohortAudit {
  readonly phase: "warmup" | "measured";
  readonly repetition: number;
  readonly observedTargets: Readonly<Record<CapacityLeakTargetKind, number>>;
  readonly survivingKinds: readonly CapacityLeakTargetKind[];
  readonly survivingWitnesses: number;
  readonly censusConsistent: boolean;
}

interface ActiveCohort {
  readonly phase: CapacityLeakCohortAudit["phase"];
  readonly repetition: number;
  readonly Witness: new () => object;
  readonly seen: WeakSet<object>;
  readonly observedTargets: Record<CapacityLeakTargetKind, number>;
  readonly witnesses: Map<CapacityLeakTargetKind, object>;
}

export interface CapacityLeakCohort {
  readonly phase: CapacityLeakCohortAudit["phase"];
  readonly repetition: number;
  readonly Witness: new () => object;
  readonly observedTargets: Readonly<Record<CapacityLeakTargetKind, number>>;
  readonly witnessReferences: ReadonlyMap<CapacityLeakTargetKind, WeakRef<object>>;
}

const witnessesByTarget = new WeakMap<object, Set<object>>();
let activeCohort: ActiveCohort | undefined;

function emptyTargetCounts(): Record<CapacityLeakTargetKind, number> {
  return Object.fromEntries(capacityLeakTargetKinds.map((kind) => [kind, 0])) as Record<
    CapacityLeakTargetKind,
    number
  >;
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function witnessCount(Witness: new () => object): number {
  const count = queryObjects(Witness, { format: "count" });
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError("v8.queryObjects() returned an invalid witness count");
  }
  return count;
}

export function beginCapacityLeakCohort(
  phase: CapacityLeakCohortAudit["phase"],
  repetition: number,
): void {
  if (activeCohort) throw new Error("a capacity leak cohort is already active");
  if (!Number.isSafeInteger(repetition) || repetition < 0) {
    throw new RangeError("capacity leak repetition must be a non-negative safe integer");
  }
  activeCohort = {
    phase,
    repetition,
    Witness: class CapacityLifetimeWitness {},
    seen: new WeakSet(),
    observedTargets: emptyTargetCounts(),
    witnesses: new Map(),
  };
}

export function trackCapacityLeakTarget(kind: CapacityLeakTargetKind, target: object): void {
  const cohort = activeCohort;
  if (!cohort) throw new Error("capacity leak tracking requires an active cohort");
  if (cohort.seen.has(target)) return;
  cohort.seen.add(target);
  cohort.observedTargets[kind]++;
  let witness = cohort.witnesses.get(kind);
  if (!witness) {
    witness = new cohort.Witness();
    cohort.witnesses.set(kind, witness);
  }
  // WeakMap ephemeron semantics keep every cohort witness reachable exactly
  // while its observed target remains reachable. A set preserves an older
  // cohort if a target is deliberately reused; replacing its value would hide
  // that survivor. The probe never mutates or strongly retains target objects.
  let targetWitnesses = witnessesByTarget.get(target);
  if (!targetWitnesses) {
    targetWitnesses = new Set();
    witnessesByTarget.set(target, targetWitnesses);
  }
  targetWitnesses.add(witness);
}

export function takeCapacityLeakCohort(): CapacityLeakCohort {
  const cohort = activeCohort;
  if (!cohort) throw new Error("there is no active capacity leak cohort to seal");
  activeCohort = undefined;
  return Object.freeze({
    phase: cohort.phase,
    repetition: cohort.repetition,
    Witness: cohort.Witness,
    observedTargets: Object.freeze({ ...cohort.observedTargets }),
    witnessReferences: new Map(
      [...cohort.witnesses].map(([kind, witness]) => [kind, new WeakRef(witness)] as const),
    ),
  });
}

export async function auditCapacityLeakCohort(
  cohort: CapacityLeakCohort,
): Promise<CapacityLeakCohortAudit> {
  // WeakRef targets created in the current JavaScript job are kept alive until
  // that job ends. Cross one explicit event-loop turn before queryObjects runs
  // its full GC, then dereference each witness only once for classification.
  await nextTurn();
  const survivingWitnesses = witnessCount(cohort.Witness);
  const survivingKinds = capacityLeakTargetKinds.filter(
    (kind) => cohort.witnessReferences.get(kind)?.deref() !== undefined,
  );
  return Object.freeze({
    phase: cohort.phase,
    repetition: cohort.repetition,
    observedTargets: cohort.observedTargets,
    survivingKinds: Object.freeze(survivingKinds),
    survivingWitnesses,
    censusConsistent: survivingWitnesses === survivingKinds.length,
  });
}

export async function calibrateCapacityLeakProbe(): Promise<CapacityLeakProbeCalibration> {
  if (activeCohort) throw new Error("capacity leak calibration requires no active cohort");
  class CalibrationWitness {}
  await nextTurn();
  const baselineWitnesses = witnessCount(CalibrationWitness);

  let releasedTarget: object | undefined = {};
  let releasedWitness: object | undefined = new CalibrationWitness();
  const releasedReference = new WeakRef(releasedWitness);
  witnessesByTarget.set(releasedTarget, new Set([releasedWitness]));
  releasedTarget = undefined;
  releasedWitness = undefined;
  await nextTurn();
  const releasedWitnesses = witnessCount(CalibrationWitness);
  const releasedWeakReferenceCleared = releasedReference.deref() === undefined;

  const retainedProperty = Symbol("vue-tui.capacity.retained-calibration-target");
  let retainedTarget: object | undefined = {};
  let retainedWitness: object | undefined = new CalibrationWitness();
  const retainedReference = new WeakRef(retainedWitness);
  witnessesByTarget.set(retainedTarget, new Set([retainedWitness]));
  Object.defineProperty(globalThis, retainedProperty, {
    configurable: true,
    value: retainedTarget,
  });
  retainedTarget = undefined;
  retainedWitness = undefined;
  await nextTurn();
  const retainedWitnesses = witnessCount(CalibrationWitness);
  const retainedWeakReferenceObserved = retainedReference.deref() !== undefined;
  Reflect.deleteProperty(globalThis, retainedProperty);
  await nextTurn();
  const witnessesAfterRelease = witnessCount(CalibrationWitness);
  const retainedWeakReferenceCleared = retainedReference.deref() === undefined;

  const valid =
    baselineWitnesses === 0 &&
    releasedWitnesses === 0 &&
    retainedWitnesses === 1 &&
    witnessesAfterRelease === 0 &&
    releasedWeakReferenceCleared &&
    retainedWeakReferenceObserved &&
    retainedWeakReferenceCleared;
  return Object.freeze({
    basis: "v8-query-objects-weakmap-witness",
    baselineWitnesses,
    releasedWitnesses,
    retainedWitnesses,
    witnessesAfterRelease,
    releasedWeakReferenceCleared,
    retainedWeakReferenceObserved,
    retainedWeakReferenceCleared,
    valid,
  });
}
