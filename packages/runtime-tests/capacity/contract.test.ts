import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vite-plus/test";
import {
  heapUsedWithoutCodeAndBytecode,
  memoryTrend,
  type CapacityMemorySample,
} from "./memory.ts";
import { nearestRank } from "./metrics.ts";
import { assessCapacityRun, type CapacityWorkerEvidence } from "./policy.ts";
import { capacityRunSpecs, selectCapacityRunSpecs } from "./run-selection.ts";
import { capacityWorkerV8Flags } from "./worker-config.ts";
import { capacityLeakTargetKinds } from "./leak-probe.ts";
import { capacityManifest, type CapacityJourneyId, type JourneyExecution } from "./workloads.tsx";

test("capacity manifest keeps the fixed J1-J6 workload", () => {
  expect(capacityManifest).toStrictEqual({
    j1: {
      columns: 100,
      rows: 30,
      completedRecords: 500,
      semanticLinesPerRecord: 2,
      tokenUpdates: 240,
      approvals: 2,
      resizes: 2,
      suspensions: 1,
      coordinatedStdout: 1,
      coordinatedStderr: 1,
    },
    j2: {
      columns: 100,
      rows: 30,
      candidates: 2_000,
      maximumVisibleRows: 28,
      queryEdits: 6,
      navigationActions: 200,
      accepts: 1,
      cancels: 1,
    },
    j3: {
      columns: 100,
      rows: 30,
      documentLines: 500,
      cellsPerLine: 72,
      scrollActions: 200,
      selectionMoves: 100,
      rangeUpdates: 1,
      copies: 1,
    },
    j4: {
      columns: 120,
      rows: 40,
      metricRows: 120,
      columnsPerMetric: 6,
      sparseUpdates: 300,
      quitActions: 1,
    },
    j5: {
      columns: 120,
      rows: 40,
      panes: 4,
      rowsPerPane: 100,
      sparseUpdates: 200,
      focusActions: 100,
      scrollActions: 40,
      dividerMoves: 20,
      overlayCycles: 1,
    },
    j6i: {
      columns: 100,
      rows: 30,
      volumes: {
        small: { completedRecords: 100, liveUpdates: 200 },
        large: { completedRecords: 1_000, liveUpdates: 2_000 },
      },
      coordinatedEvery: 10,
      coordinatedRecordBytes: 1_024,
      producerTurnMs: 1,
      maxFps: 0,
      highWaterMarkBytes: 256,
      firstBackpressureCallbackMs: 200,
      laterCallbackMs: 20,
      repetitions: 5,
    },
    j6f: {
      columns: 120,
      rows: 40,
      metricRows: 120,
      columnsPerMetric: 6,
      volumes: {
        small: { sparseUpdates: 200 },
        large: { sparseUpdates: 2_000 },
      },
      coordinatedEvery: 10,
      coordinatedRecordBytes: 1_024,
      producerTurnMs: 1,
      maxFps: 0,
      highWaterMarkBytes: 256,
      firstBackpressureCallbackMs: 200,
      laterCallbackMs: 20,
      repetitions: 5,
    },
  });
});

test("workloads use public Runtime APIs except the explicit output-coordination stress seam", () => {
  const source = readFileSync(new URL("./workloads.tsx", import.meta.url), "utf8");
  const runtimeImports = [...source.matchAll(/from "(@vue-tui\/runtime[^"]*)"/g)].map(
    (match) => match[1],
  );
  expect(runtimeImports).toStrictEqual(["@vue-tui/runtime", "@vue-tui/runtime/inline"]);
  const repositoryPrivateImports = [
    ...source.matchAll(/from "(\.\.\/\.\.\/runtime\/dist\/internal\.mjs)"/g),
  ].map((match) => match[1]);
  expect(repositoryPrivateImports).toStrictEqual([
    "../../runtime/dist/internal.mjs",
    "../../runtime/dist/internal.mjs",
    "../../runtime/dist/internal.mjs",
  ]);
  expect(source).not.toContain("../../runtime/src/internal.ts");
  expect(source).not.toContain("@vue-tui/testing");
  expect(source).not.toMatch(/\.\.\/\.\.\/runtime\/src/);
});

test("the capacity runner executes both J6 volumes at the frozen repetition count", () => {
  const source = readFileSync(new URL("./run-selection.ts", import.meta.url), "utf8");
  expect(source).toContain('Object.freeze({ journey: "j6i", volume: "small" })');
  expect(source).toContain('Object.freeze({ journey: "j6i", volume: "large" })');
  expect(source).toContain('Object.freeze({ journey: "j6f", volume: "small" })');
  expect(source).toContain('Object.freeze({ journey: "j6f", volume: "large" })');
  const runnerSource = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
  expect(runnerSource).toContain("repetitions: capacityManifest[journey].repetitions");
  expect(runnerSource).toContain("warmups: 3");
  expect(runnerSource).toContain("repetitions: 10");
  expect(runnerSource).toContain("...capacityWorkerV8Flags");
  expect(runnerSource).toContain("workerV8Flags: capacityWorkerV8Flags");
  expect(runnerSource).toContain("schemaVersion: 6");
  expect(runnerSource).toContain('basis: "tracked-runtime-lifetimes-v1"');
  expect(runnerSource).toContain("supersedesSchemas: Object.freeze([4, 5])");
  expect(runnerSource).toContain('oracle: "v8.queryObjects"');
  expect(runnerSource).toContain('hostNodeCoverage: "every TuiNode identity at construction"');
  expect(runnerSource).toContain("affectsAcceptance: false");
  expect(runnerSource).toContain("v8: process.versions.v8");
  expect(capacityWorkerV8Flags).toEqual(["--invocation-count-for-feedback-allocation=1"]);
});

test("capacity diagnostics exclude retained execution evidence", () => {
  const source = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
  expect(source).toMatch(
    /await runRepetition\(repetition\);[\s\S]*auditCapacityLeakCohort[\s\S]*const sample = await collectMemory\(phase, repetition\)/,
  );
  expect(source).toMatch(/const measured = await Promise\.all\([\s\S]*readFile\(resultPath/);
  expect(source).not.toContain("measured.push(result)");
  expect(source).not.toContain("memory.push(");
  expect(source).not.toContain("measuredPaths.push(");
  expect(source).toContain("const heapUsedSamples = new Float64Array(total)");
  expect(source).toContain("const reachableJsMemoryEstimateSamples = new Float64Array(total)");
  expect(source).toContain("loaded.beginCapacityLeakCohort(phase, repetition)");
  expect(source).toContain("`${repetition}.retention.json`");
  const hostSource = readFileSync(new URL("./host.ts", import.meta.url), "utf8");
  expect(hostSource).toContain("observeTuiNodeCreations((node) =>");
  expect(hostSource).not.toContain("trackTuiTree");
  const nodeSource = readFileSync(
    new URL("../../runtime/src/host/nodes.ts", import.meta.url),
    "utf8",
  );
  expect(nodeSource).toMatch(
    /function trackTuiNode[\s\S]*tuiNodeCreationObservers[\s\S]*return node/,
  );
  expect(source).toMatch(/const measuredPaths = Array\.from\([\s\S]*const measured =/);
  const memorySource = readFileSync(new URL("./memory.ts", import.meta.url), "utf8");
  expect(memorySource).toContain('measureMemory({ mode: "detailed", execution: "eager" })');
  expect(memorySource).toContain("current?.jsMemoryEstimate");
});

test("capacity memory trends preserve reachable-JavaScript diagnostics", () => {
  const sample = (
    repetition: number,
    heapUsed: number,
    codeAndMetadataSize: number,
    reachableJsMemoryEstimate: number,
    bytecodeAndMetadataSize = 100,
  ): CapacityMemorySample => ({
    phase: "measured",
    repetition,
    heapUsed,
    codeAndMetadataSize,
    bytecodeAndMetadataSize,
    heapUsedWithoutCodeAndBytecode: heapUsedWithoutCodeAndBytecode(
      heapUsed,
      codeAndMetadataSize,
      bytecodeAndMetadataSize,
    ),
    reachableJsMemoryEstimate,
    reachableJsMemoryRange: [reachableJsMemoryEstimate, reachableJsMemoryEstimate],
    rss: 2_000,
  });
  const codeTierUp = Array.from({ length: 10 }, (_, index) =>
    index < 5 ? sample(index, 1_100, 100, 900) : sample(index, 1_673, 673, 900),
  );
  expect(memoryTrend(codeTierUp)).toEqual({
    basis: "current-v8-context-reachable-js-memory-estimate",
    sampleCount: 10,
    firstThreeReachableJsMemoryMedian: 900,
    finalThreeReachableJsMemoryMedian: 900,
    memoryDelta: 0,
  });

  const retainedGrowth = codeTierUp.map((entry, index) =>
    index < 7
      ? entry
      : sample(
          entry.repetition,
          entry.heapUsed + 1,
          entry.codeAndMetadataSize,
          entry.reachableJsMemoryEstimate + 1,
          entry.bytecodeAndMetadataSize,
        ),
  );
  expect(memoryTrend(retainedGrowth).memoryDelta).toBe(1);
});

test("reachable JavaScript memory detects and releases a real retained object graph", () => {
  execFileSync(
    process.execPath,
    [
      ...capacityWorkerV8Flags,
      "--expose-gc",
      "--import=tsx",
      fileURLToPath(new URL("./memory-positive-control.ts", import.meta.url)),
    ],
    {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      stdio: "pipe",
    },
  );
});

test("the Runtime lifetime probe detects and releases a retained target", () => {
  execFileSync(
    process.execPath,
    ["--import=tsx", fileURLToPath(new URL("./leak-probe-positive-control.ts", import.meta.url))],
    {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      stdio: "pipe",
    },
  );
});

test("capacity journey selection preserves the complete default and filters whole J6 volumes", () => {
  expect(selectCapacityRunSpecs()).toBe(capacityRunSpecs);
  expect(selectCapacityRunSpecs("j2,j6f")).toStrictEqual([
    { journey: "j2" },
    { journey: "j6f", volume: "small" },
    { journey: "j6f", volume: "large" },
  ]);
  expect(selectCapacityRunSpecs("j2,j2")).toStrictEqual([{ journey: "j2" }]);
  expect(() => selectCapacityRunSpecs("")).toThrow("one or more");
  expect(() => selectCapacityRunSpecs("j7")).toThrow("unknown capacity journey: j7");
});

test("nearest-rank percentiles do not interpolate", () => {
  const samples = [9, 1, 5, 3, 7];
  expect(nearestRank(samples, 0.5)).toBe(5);
  expect(nearestRank(samples, 0.95)).toBe(9);
  expect(nearestRank(samples, 0.99)).toBe(9);
});

function evidence(
  journey: CapacityJourneyId,
  values: {
    readonly latencyP95?: number;
    readonly latencyMaximum?: number;
    readonly heartbeatP99?: number;
    readonly heartbeatMaximum?: number;
    readonly memoryDelta?: number;
  } = {},
): CapacityWorkerEvidence {
  const execution: JourneyExecution = {
    journey,
    actionLatencies: [],
    renderDurations: [],
    heartbeatExcess: [],
    assertionCount: 1,
    resources: Object.freeze({}) as JourneyExecution["resources"],
    yoga: { liveBefore: 0, liveAfter: 0, created: 1, freed: 1 },
    output: {
      stdoutWrites: 1,
      stdoutBytes: 1,
      maximumStdoutWriteBytes: 1,
      stderrWrites: 0,
      stderrBytes: 0,
    },
  };
  return {
    journey,
    kind: "journey",
    warmups: 3,
    repetitions: 10,
    maxFps: 30,
    v8Flags: capacityWorkerV8Flags,
    measured: [execution],
    memory: [],
    memoryTrend: {
      basis: "current-v8-context-reachable-js-memory-estimate",
      sampleCount: 10,
      firstThreeReachableJsMemoryMedian: 1_000,
      finalThreeReachableJsMemoryMedian: 1_000 + (values.memoryDelta ?? 0),
      memoryDelta: values.memoryDelta ?? 0,
    },
    retention: {
      protocol: "tracked-runtime-lifetimes-v1",
      calibration: {
        basis: "v8-query-objects-weakmap-witness",
        baselineWitnesses: 0,
        releasedWitnesses: 0,
        retainedWitnesses: 1,
        witnessesAfterRelease: 0,
        releasedWeakReferenceCleared: true,
        retainedWeakReferenceObserved: true,
        retainedWeakReferenceCleared: true,
        valid: true,
      },
      audits: Array.from({ length: 13 }, (_, repetition) => ({
        phase: repetition < 3 ? ("warmup" as const) : ("measured" as const),
        repetition,
        observedTargets: Object.fromEntries(
          capacityLeakTargetKinds.map((kind) => [kind, 1]),
        ) as Record<(typeof capacityLeakTargetKinds)[number], number>,
        survivingKinds: [],
        survivingWitnesses: 0,
        censusConsistent: true,
      })),
    },
    latency: {
      count: 1,
      p50: 1,
      p95: values.latencyP95 ?? 50,
      p99: values.latencyP95 ?? 50,
      maximum: values.latencyMaximum ?? 60,
    },
    heartbeat: {
      count: 1,
      p50: 1,
      p95: 1,
      p99: values.heartbeatP99 ?? 20,
      maximum: values.heartbeatMaximum ?? 30,
    },
    renderDuration: { count: 1, p50: 1, p95: 1, p99: 1, maximum: 1 },
  };
}

function passingJ6Evidence(journey: "j6i" | "j6f"): CapacityWorkerEvidence {
  const base = evidence(journey);
  const execution = base.measured[0]!;
  return {
    ...base,
    volume: "small",
    measured: [
      {
        ...execution,
        volume: "small",
        backpressure: {
          highWaterMarkBytes: 256,
          writeAttempts: 2,
          writeFalseCount: 1,
          drainCount: 1,
          writesBeforeDrain: 0,
          largestAtomicTransactionBytes: 1_024,
          maximumWritableLengthBytes: 1_024,
          currentWritableLengthBytes: 0,
          writableNeedDrain: false,
          heldBackpressureCallbacks: 1,
          coordinatedRecords: 1,
          coordinatedAcceptedWritable: 0,
          coordinatedAcceptedBackpressured: 1,
          coordinatedBlocked: 1,
          maximumPreparedFrames: 1,
          maximumLifecycleTransactions: 1,
          maximumSchedulerTimers: 1,
          maximumStreamListeners: 4,
          maximumSynchronizedOutputLeases: 1,
          maximumStreamReservations: 1,
        },
      },
    ],
  };
}

describe("capacity acceptance policy", () => {
  test("keeps the frozen hard bounds", () => {
    const workload = evidence("j3", { latencyP95: 201, heartbeatMaximum: 201 });
    const assessment = assessCapacityRun("j3", workload, evidence("j3"), true);
    expect(assessment.status).toBe("fail");
    expect(assessment.hardFailures).toHaveLength(2);
  });

  test("returns the 100-200ms p95 interval for a maintainer decision", () => {
    const workload = evidence("j4", { latencyP95: 110 });
    const assessment = assessCapacityRun("j4", workload, evidence("j4"), true);
    expect(assessment.status).toBe("needs-maintainer-decision");
  });

  test("records positive aggregate memory growth without treating it as a leak", () => {
    const workload = evidence("j2", { memoryDelta: 6 });
    const control = evidence("j2", { memoryDelta: 5 });
    const assessment = assessCapacityRun("j2", workload, control, true);
    expect(assessment.status).toBe("pass");
    expect(assessment.memoryDeltaExcess).toBe(1);
    expect(assessment.memoryGrowthObserved).toBe(true);
  });

  test("fails when a tracked Runtime lifetime remains reachable", () => {
    const workload = evidence("j2");
    const firstAudit = workload.retention.audits[0]!;
    const retained: CapacityWorkerEvidence = {
      ...workload,
      retention: {
        ...workload.retention,
        audits: [
          { ...firstAudit, survivingKinds: ["tui-app"], survivingWitnesses: 1 },
          ...workload.retention.audits.slice(1),
        ],
      },
    };
    const assessment = assessCapacityRun("j2", retained, evidence("j2"), true);
    expect(assessment.status).toBe("fail");
    expect(assessment.retentionReleased).toBe(false);
  });

  test("fails when lifetime coverage or Yoga release evidence is incomplete", () => {
    const workload = evidence("j3");
    const execution = workload.measured[0]!;
    const firstAudit = workload.retention.audits[0]!;
    const incomplete: CapacityWorkerEvidence = {
      ...workload,
      measured: [{ ...execution, yoga: { ...execution.yoga, freed: 0 } }],
      retention: {
        ...workload.retention,
        audits: [
          {
            ...firstAudit,
            observedTargets: { ...firstAudit.observedTargets, "host-node": 0 },
          },
          ...workload.retention.audits.slice(1),
        ],
      },
    };
    const assessment = assessCapacityRun("j3", incomplete, evidence("j3"), true);
    expect(assessment.status).toBe("fail");
    expect(assessment.yogaReleased).toBe(false);
    expect(assessment.retentionCoverageComplete).toBe(false);
  });

  test("treats missing J6 backpressure evidence as a hard failure", () => {
    const workload = evidence("j6i");
    const assessment = assessCapacityRun("j6i", workload, evidence("j6i"), false);
    expect(assessment.status).toBe("fail");
    expect(assessment.hardFailures).toContain("j6i repetition 1 produced no backpressure evidence");
  });

  test("accepts J6 only when every bounded-output invariant is present", () => {
    const workload = passingJ6Evidence("j6f");
    const assessment = assessCapacityRun("j6f", workload, evidence("j6f"), false);
    expect(assessment.status).toBe("pass");
    expect(assessment.hardFailures).toEqual([]);
  });
});
