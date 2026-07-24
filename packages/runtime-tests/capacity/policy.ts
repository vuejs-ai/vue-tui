import type { PercentileSummary } from "./metrics.ts";
import type { CapacityMemorySample, CapacityMemoryTrend } from "./memory.ts";
import type { capacityWorkerV8Flags } from "./worker-config.ts";
import {
  capacityLeakTargetKinds,
  type CapacityLeakCohortAudit,
  type CapacityLeakProbeCalibration,
} from "./leak-probe.ts";
import {
  capacityManifest,
  type CapacityJourneyId,
  type CapacityVolume,
  type JourneyExecution,
} from "./workloads.tsx";

export const capacityThresholds = Object.freeze({
  latencyP95Ms: 200,
  latencyMaximumMs: 500,
  immediateFeedbackReviewMs: 100,
  heartbeatP99ExcessMs: 100,
  heartbeatMaximumExcessMs: 200,
  repeatBandFraction: 0.2,
});

export interface CapacityWorkerEvidence {
  readonly journey: CapacityJourneyId;
  readonly kind: "journey" | "control";
  readonly warmups: number;
  readonly repetitions: number;
  readonly maxFps: number;
  readonly volume?: CapacityVolume;
  readonly v8Flags: typeof capacityWorkerV8Flags;
  readonly measured: readonly JourneyExecution[];
  readonly memory: readonly CapacityMemorySample[];
  readonly memoryTrend: CapacityMemoryTrend;
  readonly retention: {
    readonly protocol: "tracked-runtime-lifetimes-v1";
    readonly calibration: CapacityLeakProbeCalibration;
    readonly audits: readonly CapacityLeakCohortAudit[];
  };
  readonly latency: PercentileSummary;
  readonly heartbeat: PercentileSummary;
  readonly renderDuration: PercentileSummary;
}

export interface CapacityAssessment {
  readonly status: "pass" | "fail" | "needs-repeat" | "needs-maintainer-decision";
  readonly hardFailures: readonly string[];
  readonly repeatReasons: readonly string[];
  readonly maintainerDecisionReasons: readonly string[];
  readonly resourcesReleased: boolean;
  readonly yogaReleased: boolean;
  readonly leakProbeCalibrated: boolean;
  readonly retentionCoverageComplete: boolean;
  readonly retentionReleased: boolean;
  readonly memoryDiagnosticSampled: boolean;
  readonly memoryGrowthObserved: boolean;
  readonly workloadMemoryDelta: number;
  readonly controlMemoryDeltaAllowance: number;
  readonly memoryDeltaExcess: number;
}

function inRepeatBand(value: number, limit: number): boolean {
  const distance = capacityThresholds.repeatBandFraction * limit;
  return value >= limit - distance && value <= limit + distance;
}

function isJ6(journey: CapacityJourneyId): journey is "j6i" | "j6f" {
  return journey === "j6i" || journey === "j6f";
}

export function assessCapacityRun(
  journey: CapacityJourneyId,
  workload: CapacityWorkerEvidence,
  control: CapacityWorkerEvidence,
  enforceTiming: boolean,
): CapacityAssessment {
  const hardFailures: string[] = [];
  const repeatReasons: string[] = [];
  const maintainerDecisionReasons: string[] = [];
  const workers = [workload, control] as const;
  const executions = workers.flatMap((worker) => worker.measured);
  const resourcesReleased = executions.every((execution) =>
    Object.values(execution.resources).every((count) => count === 0),
  );
  if (!resourcesReleased) hardFailures.push("a Runtime resource count remained nonzero");
  const yogaReleased = executions.every(
    (execution) =>
      execution.yoga.created === execution.yoga.freed &&
      execution.yoga.liveAfter === execution.yoga.liveBefore,
  );
  if (!yogaReleased) hardFailures.push("Yoga nodes did not return to the pre-mount baseline");

  const leakProbeCalibrated = workers.every((worker) => worker.retention.calibration.valid);
  if (!leakProbeCalibrated) hardFailures.push("the Runtime lifetime probe failed calibration");
  const retentionCoverageComplete = workers.every(
    (worker) =>
      worker.retention.protocol === "tracked-runtime-lifetimes-v1" &&
      worker.retention.audits.length === worker.warmups + worker.repetitions &&
      worker.retention.audits.every(
        (audit, repetition) =>
          audit.repetition === repetition &&
          audit.phase === (repetition < worker.warmups ? "warmup" : "measured") &&
          capacityLeakTargetKinds.every((kind) => audit.observedTargets[kind] > 0),
      ),
  );
  if (!retentionCoverageComplete) {
    hardFailures.push("the Runtime lifetime probe did not observe every required target kind");
  }
  const retentionReleased = workers.every((worker) =>
    worker.retention.audits.every(
      (audit) =>
        audit.censusConsistent &&
        audit.survivingWitnesses === 0 &&
        audit.survivingKinds.length === 0,
    ),
  );
  if (!retentionReleased) {
    hardFailures.push("a tracked Runtime lifetime target remained reachable after teardown");
  }

  if (isJ6(journey)) {
    for (const [index, execution] of workload.measured.entries()) {
      const evidence = execution.backpressure;
      const prefix = `${journey} repetition ${index + 1}`;
      if (!evidence) {
        hardFailures.push(`${prefix} produced no backpressure evidence`);
        continue;
      }
      if (evidence.highWaterMarkBytes !== capacityManifest[journey].highWaterMarkBytes) {
        hardFailures.push(`${prefix} did not use the frozen 256-byte high-water mark`);
      }
      if (evidence.writeFalseCount === 0) {
        hardFailures.push(`${prefix} never observed Writable.write() return false`);
      }
      if (evidence.drainCount !== evidence.writeFalseCount) {
        hardFailures.push(`${prefix} did not drain every accepted backpressured transaction`);
      }
      if (evidence.writesBeforeDrain !== 0) {
        hardFailures.push(`${prefix} wrote again before drain`);
      }
      if (
        evidence.maximumWritableLengthBytes >
        evidence.highWaterMarkBytes + evidence.largestAtomicTransactionBytes
      ) {
        hardFailures.push(`${prefix} exceeded the bounded writableLength allowance`);
      }
      if (evidence.currentWritableLengthBytes !== 0 || evidence.writableNeedDrain) {
        hardFailures.push(`${prefix} left the Writable queue unsettled`);
      }
      if (evidence.heldBackpressureCallbacks !== 1) {
        hardFailures.push(`${prefix} did not hold exactly the first backpressured callback`);
      }
      if (evidence.coordinatedBlocked === 0) {
        hardFailures.push(`${prefix} did not expose a blocked coordinated-write result`);
      }
      if (
        evidence.coordinatedAcceptedBackpressured !== evidence.coordinatedRecords ||
        evidence.coordinatedAcceptedWritable !== 0
      ) {
        hardFailures.push(`${prefix} did not accept every 1 KiB record exactly once`);
      }
      if (
        evidence.maximumPreparedFrames > 1 ||
        evidence.maximumLifecycleTransactions > 1 ||
        evidence.maximumSchedulerTimers > 1 ||
        evidence.maximumStreamListeners > 4 ||
        evidence.maximumSynchronizedOutputLeases > 1 ||
        evidence.maximumStreamReservations !== 1
      ) {
        hardFailures.push(`${prefix} exceeded a Runtime-owned pending-state bound`);
      }
    }
  }

  if (enforceTiming && !isJ6(journey)) {
    if (journey !== "j1") {
      if (workload.latency.p95 > capacityThresholds.latencyP95Ms) {
        hardFailures.push(
          `latency p95 ${workload.latency.p95}ms exceeded ${capacityThresholds.latencyP95Ms}ms`,
        );
      }
      if (workload.latency.maximum > capacityThresholds.latencyMaximumMs) {
        hardFailures.push(
          `latency maximum ${workload.latency.maximum}ms exceeded ${capacityThresholds.latencyMaximumMs}ms`,
        );
      }
      if (
        workload.latency.p95 > capacityThresholds.immediateFeedbackReviewMs &&
        workload.latency.p95 <= capacityThresholds.latencyP95Ms
      ) {
        maintainerDecisionReasons.push(
          `latency p95 ${workload.latency.p95}ms is above the ${capacityThresholds.immediateFeedbackReviewMs}ms immediate-feedback alternative`,
        );
      }
      if (inRepeatBand(workload.latency.p95, capacityThresholds.latencyP95Ms)) {
        repeatReasons.push("latency p95 is within 20% of its limit");
      }
      if (inRepeatBand(workload.latency.maximum, capacityThresholds.latencyMaximumMs)) {
        repeatReasons.push("latency maximum is within 20% of its limit");
      }
    }
    if (workload.heartbeat.p99 > capacityThresholds.heartbeatP99ExcessMs) {
      hardFailures.push(
        `heartbeat p99 excess ${workload.heartbeat.p99}ms exceeded ${capacityThresholds.heartbeatP99ExcessMs}ms`,
      );
    }
    if (workload.heartbeat.maximum > capacityThresholds.heartbeatMaximumExcessMs) {
      hardFailures.push(
        `heartbeat maximum excess ${workload.heartbeat.maximum}ms exceeded ${capacityThresholds.heartbeatMaximumExcessMs}ms`,
      );
    }
    if (inRepeatBand(workload.heartbeat.p99, capacityThresholds.heartbeatP99ExcessMs)) {
      repeatReasons.push("heartbeat p99 excess is within 20% of its limit");
    }
    if (inRepeatBand(workload.heartbeat.maximum, capacityThresholds.heartbeatMaximumExcessMs)) {
      repeatReasons.push("heartbeat maximum excess is within 20% of its limit");
    }
  }

  const memoryDiagnosticSampled =
    workload.memoryTrend.sampleCount >= 10 && control.memoryTrend.sampleCount >= 10;
  const workloadMemoryDelta = workload.memoryTrend.memoryDelta;
  const controlMemoryDeltaAllowance = Math.max(0, control.memoryTrend.memoryDelta);
  const memoryDeltaExcess = workloadMemoryDelta - controlMemoryDeltaAllowance;
  const memoryGrowthObserved = memoryDiagnosticSampled && memoryDeltaExcess > 0;

  let status: CapacityAssessment["status"] = "pass";
  if (hardFailures.length > 0) status = "fail";
  else if (maintainerDecisionReasons.length > 0) status = "needs-maintainer-decision";
  else if (repeatReasons.length > 0) status = "needs-repeat";
  return Object.freeze({
    status,
    hardFailures: Object.freeze(hardFailures),
    repeatReasons: Object.freeze(repeatReasons),
    maintainerDecisionReasons: Object.freeze(maintainerDecisionReasons),
    resourcesReleased,
    yogaReleased,
    leakProbeCalibrated,
    retentionCoverageComplete,
    retentionReleased,
    memoryDiagnosticSampled,
    memoryGrowthObserved,
    workloadMemoryDelta,
    controlMemoryDeltaAllowance,
    memoryDeltaExcess,
  });
}
