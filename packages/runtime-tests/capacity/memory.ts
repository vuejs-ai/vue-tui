import { getHeapCodeStatistics } from "node:v8";
import { measureMemory } from "node:vm";
import { median } from "./metrics.ts";

export interface CapacityMemorySample {
  readonly phase: "warmup" | "measured";
  readonly repetition: number;
  /** Raw V8 heap usage retained for diagnosis. */
  readonly heapUsed: number;
  /** Executable code plus its V8 metadata within `heapUsed`. */
  readonly codeAndMetadataSize: number;
  /** Bytecode plus its V8 metadata within `heapUsed`. */
  readonly bytecodeAndMetadataSize: number;
  /** Heap usage after excluding V8 code and bytecode tier-up. */
  readonly heapUsedWithoutCodeAndBytecode: number;
  /** Experimental V8 estimate of JavaScript memory reachable from the current context. */
  readonly reachableJsMemoryEstimate: number;
  readonly reachableJsMemoryRange: readonly [number, number];
  readonly rss: number;
}

export interface CapacityMemoryTrend {
  readonly basis: "current-v8-context-reachable-js-memory-estimate";
  readonly sampleCount: number;
  readonly firstThreeReachableJsMemoryMedian: number;
  readonly finalThreeReachableJsMemoryMedian: number;
  readonly memoryDelta: number;
}

export function heapUsedWithoutCodeAndBytecode(
  heapUsed: number,
  codeAndMetadataSize: number,
  bytecodeAndMetadataSize: number,
): number {
  const adjusted = heapUsed - codeAndMetadataSize - bytecodeAndMetadataSize;
  if (!Number.isFinite(adjusted) || adjusted < 0) {
    throw new RangeError("V8 code and bytecode sizes must fit within heapUsed");
  }
  return adjusted;
}

interface DetailedMemoryMeasurement {
  readonly current?: {
    readonly jsMemoryEstimate?: unknown;
    readonly jsMemoryRange?: unknown;
  };
}

function checkedReachableMemory(result: Awaited<ReturnType<typeof measureMemory>>): {
  readonly estimate: number;
  readonly range: readonly [number, number];
} {
  const current = (result as DetailedMemoryMeasurement).current;
  const estimate = current?.jsMemoryEstimate;
  const range = current?.jsMemoryRange;
  if (!Array.isArray(range) || range.length !== 2) {
    throw new TypeError("vm.measureMemory() did not return detailed current-context memory");
  }
  const [minimum, maximum] = range;
  if (
    typeof estimate !== "number" ||
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isFinite(estimate) ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    estimate < 0 ||
    minimum < 0 ||
    maximum < minimum ||
    estimate < minimum ||
    estimate > maximum
  ) {
    throw new RangeError("vm.measureMemory() returned an invalid current-context estimate");
  }
  return Object.freeze({ estimate, range: Object.freeze([minimum, maximum] as const) });
}

export async function collectMemory(
  phase: CapacityMemorySample["phase"],
  repetition: number,
): Promise<CapacityMemorySample> {
  if (!globalThis.gc) throw new Error("capacity workers require node --expose-gc");
  globalThis.gc();
  // Node documents this as an estimate of JavaScript memory reachable from the
  // current V8 context. Reachable functions can still carry JIT and feedback
  // metadata, so this remains diagnostic rather than a leak predicate. The API
  // is experimental and V8-specific; record Node/V8 and guard its exact shape.
  const reachable = checkedReachableMemory(
    await measureMemory({ mode: "detailed", execution: "eager" }),
  );
  const usage = process.memoryUsage();
  const code = getHeapCodeStatistics();
  const codeAndMetadataSize = code.code_and_metadata_size;
  const bytecodeAndMetadataSize = code.bytecode_and_metadata_size;
  return Object.freeze({
    phase,
    repetition,
    heapUsed: usage.heapUsed,
    codeAndMetadataSize,
    bytecodeAndMetadataSize,
    heapUsedWithoutCodeAndBytecode: heapUsedWithoutCodeAndBytecode(
      usage.heapUsed,
      codeAndMetadataSize,
      bytecodeAndMetadataSize,
    ),
    reachableJsMemoryEstimate: reachable.estimate,
    reachableJsMemoryRange: reachable.range,
    rss: usage.rss,
  });
}

export function memoryTrend(samples: readonly CapacityMemorySample[]): CapacityMemoryTrend {
  const measured = samples.filter((sample) => sample.phase === "measured");
  const firstThreeReachableJsMemoryMedian = median(
    measured.slice(0, 3).map((sample) => sample.reachableJsMemoryEstimate),
  );
  const finalThreeReachableJsMemoryMedian = median(
    measured.slice(-3).map((sample) => sample.reachableJsMemoryEstimate),
  );
  return Object.freeze({
    basis: "current-v8-context-reachable-js-memory-estimate",
    sampleCount: measured.length,
    firstThreeReachableJsMemoryMedian,
    finalThreeReachableJsMemoryMedian,
    memoryDelta: finalThreeReachableJsMemoryMedian - firstThreeReachableJsMemoryMedian,
  });
}
