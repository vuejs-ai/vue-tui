import { getHeapCodeStatistics } from "node:v8";
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
  readonly retainedHeapUsed: number;
  readonly rss: number;
}

export interface CapacityMemoryTrend {
  readonly basis: "heap-used-minus-v8-code-and-bytecode";
  readonly sampleCount: number;
  readonly firstThreeRetainedHeapMedian: number;
  readonly finalThreeRetainedHeapMedian: number;
  readonly heapDelta: number;
}

export function retainedHeapUsed(
  heapUsed: number,
  codeAndMetadataSize: number,
  bytecodeAndMetadataSize: number,
): number {
  const retained = heapUsed - codeAndMetadataSize - bytecodeAndMetadataSize;
  if (!Number.isFinite(retained) || retained < 0) {
    throw new RangeError("V8 code and bytecode sizes must fit within heapUsed");
  }
  return retained;
}

export function collectMemory(
  phase: CapacityMemorySample["phase"],
  repetition: number,
): CapacityMemorySample {
  if (!globalThis.gc) throw new Error("capacity workers require node --expose-gc");
  globalThis.gc();
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
    retainedHeapUsed: retainedHeapUsed(
      usage.heapUsed,
      codeAndMetadataSize,
      bytecodeAndMetadataSize,
    ),
    rss: usage.rss,
  });
}

export function memoryTrend(samples: readonly CapacityMemorySample[]): CapacityMemoryTrend {
  const measured = samples.filter((sample) => sample.phase === "measured");
  const firstThreeRetainedHeapMedian = median(
    measured.slice(0, 3).map((sample) => sample.retainedHeapUsed),
  );
  const finalThreeRetainedHeapMedian = median(
    measured.slice(-3).map((sample) => sample.retainedHeapUsed),
  );
  return Object.freeze({
    basis: "heap-used-minus-v8-code-and-bytecode",
    sampleCount: measured.length,
    firstThreeRetainedHeapMedian,
    finalThreeRetainedHeapMedian,
    heapDelta: finalThreeRetainedHeapMedian - firstThreeRetainedHeapMedian,
  });
}
