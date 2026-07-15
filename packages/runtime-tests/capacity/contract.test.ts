import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";
import { nearestRank } from "./metrics.ts";
import { assessCapacityRun, type CapacityWorkerEvidence } from "./policy.ts";
import { capacityRunSpecs, selectCapacityRunSpecs } from "./run-selection.ts";
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
      pointerDrags: 1,
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
      wheelActions: 40,
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

test("workloads consume only public Runtime entry points", () => {
  const source = readFileSync(new URL("./workloads.tsx", import.meta.url), "utf8");
  const runtimeImports = [...source.matchAll(/from "(@vue-tui\/runtime[^"]*)"/g)].map(
    (match) => match[1],
  );
  expect(runtimeImports).toStrictEqual([
    "@vue-tui/runtime",
    "@vue-tui/runtime/inline",
    "@vue-tui/runtime/fullscreen",
  ]);
  expect(source).not.toContain("@vue-tui/runtime/internal");
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
});

test("capacity heap samples exclude retained execution evidence", () => {
  const source = readFileSync(new URL("./worker.ts", import.meta.url), "utf8");
  expect(source).toMatch(
    /const measuredPath = await runRepetition\(repetition\);[\s\S]*memory\.push\(collectMemory\(phase, repetition\)\)/,
  );
  expect(source).toMatch(/const measured = await Promise\.all\([\s\S]*readFile\(resultPath/);
  expect(source).not.toContain("measured.push(result)");
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
    readonly heapDelta?: number;
  } = {},
): CapacityWorkerEvidence {
  const execution: JourneyExecution = {
    journey,
    actionLatencies: [],
    renderDurations: [],
    heartbeatExcess: [],
    assertionCount: 1,
    resources: Object.freeze({}) as JourneyExecution["resources"],
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
    measured: [execution],
    memory: [],
    memoryTrend: {
      sampleCount: 10,
      firstThreeHeapMedian: 1_000,
      finalThreeHeapMedian: 1_000 + (values.heapDelta ?? 0),
      heapDelta: values.heapDelta ?? 0,
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

  test("requires a second run for positive heap growth beyond the control", () => {
    const workload = evidence("j2", { heapDelta: 20 });
    const control = evidence("j2", { heapDelta: 5 });
    const assessment = assessCapacityRun("j2", workload, control, true);
    expect(assessment.status).toBe("needs-repeat");
    expect(assessment.heapDeltaExcess).toBe(15);
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
