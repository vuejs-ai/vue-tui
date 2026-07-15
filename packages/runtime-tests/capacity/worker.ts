import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite-plus";
import {
  collectMemory,
  memoryTrend,
  type CapacityMemorySample,
  type CapacityMemoryTrend,
} from "./memory.ts";
import type { CapacityJourneyId, CapacityVolume, JourneyExecution } from "./workloads.tsx";
import { summarize } from "./metrics.ts";
import { assertCapacityWorkerV8Flags, capacityWorkerV8Flags } from "./worker-config.ts";

interface WorkerOptions {
  readonly journey: CapacityJourneyId;
  readonly kind: "journey" | "control";
  readonly warmups: number;
  readonly repetitions: number;
  readonly maxFps: number;
  readonly volume?: CapacityVolume;
}

interface WorkerEvidence {
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
  readonly latency: ReturnType<typeof summarize>;
  readonly heartbeat: ReturnType<typeof summarize>;
  readonly renderDuration: ReturnType<typeof summarize>;
}

function integerArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`--${name} must be a non-negative safe integer`);
  }
  return value;
}

function parseOptions(): WorkerOptions {
  const journeyIndex = process.argv.indexOf("--journey");
  const journey = process.argv[journeyIndex + 1] as CapacityJourneyId | undefined;
  if (!journey || !["j1", "j2", "j3", "j4", "j5", "j6i", "j6f"].includes(journey)) {
    throw new TypeError("--journey must be j1, j2, j3, j4, j5, j6i, or j6f");
  }
  const volumeIndex = process.argv.indexOf("--volume");
  const volume =
    volumeIndex < 0 ? undefined : (process.argv[volumeIndex + 1] as CapacityVolume | undefined);
  const isJ6 = journey === "j6i" || journey === "j6f";
  if (isJ6 && volume !== "small" && volume !== "large") {
    throw new TypeError("j6i and j6f require --volume small or --volume large");
  }
  if (!isJ6 && volume !== undefined) throw new TypeError("--volume is only valid for j6i or j6f");
  return Object.freeze({
    journey,
    kind: process.argv.includes("--control") ? "control" : "journey",
    warmups: integerArgument("warmups", 3),
    repetitions: integerArgument("repetitions", 10),
    maxFps: integerArgument("max-fps", 30),
    ...(volume === undefined ? {} : { volume }),
  });
}

const options = parseOptions();
assertCapacityWorkerV8Flags(process.execArgv);
const directory = path.dirname(fileURLToPath(import.meta.url));
const evidenceDirectory = await mkdtemp(path.join(tmpdir(), "vue-tui-capacity-"));
const server = await createServer({
  root: path.dirname(directory),
  configFile: path.join(path.dirname(directory), "vite.config.ts"),
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true, hmr: false },
  ssr: { external: ["@xterm/headless", "@xterm/addon-unicode11"] },
});

try {
  const loaded = (await server.ssrLoadModule("/capacity/workloads.tsx")) as {
    runCapacityJourney: (
      journey: CapacityJourneyId,
      maxFps?: number,
      volume?: CapacityVolume,
    ) => Promise<JourneyExecution>;
    runCapacityControl: (
      journey: CapacityJourneyId,
      maxFps?: number,
      volume?: CapacityVolume,
    ) => Promise<JourneyExecution>;
  };
  const total = options.warmups + options.repetitions;
  // Fixed-size typed arrays keep the measurement recorder itself constant
  // across repetitions. Growing JS arrays here would make later heap samples
  // observe the capacity harness's own backing-store expansion.
  const heapUsedSamples = new Float64Array(total);
  const codeAndMetadataSamples = new Float64Array(total);
  const bytecodeAndMetadataSamples = new Float64Array(total);
  const retainedHeapUsedSamples = new Float64Array(total);
  const rssSamples = new Float64Array(total);

  async function runRepetition(repetition: number): Promise<void> {
    const result = await loaded[
      options.kind === "control" ? "runCapacityControl" : "runCapacityJourney"
    ](options.journey, options.maxFps, options.volume);
    if (repetition < options.warmups) return;
    const resultPath = path.join(evidenceDirectory, `${repetition}.json`);
    await writeFile(resultPath, JSON.stringify(result));
  }

  for (let repetition = 0; repetition < total; repetition++) {
    // Spool the complete execution evidence outside the JS heap before the
    // sample. Retaining every prior latency/heartbeat/render array here made
    // the measurement observe its own evidence accumulator rather than only
    // Runtime and host state that survived teardown.
    await runRepetition(repetition);
    const phase = repetition < options.warmups ? "warmup" : "measured";
    const sample = collectMemory(phase, repetition);
    heapUsedSamples[repetition] = sample.heapUsed;
    codeAndMetadataSamples[repetition] = sample.codeAndMetadataSize;
    bytecodeAndMetadataSamples[repetition] = sample.bytecodeAndMetadataSize;
    retainedHeapUsedSamples[repetition] = sample.retainedHeapUsed;
    rssSamples[repetition] = sample.rss;
  }

  const memory: readonly CapacityMemorySample[] = Object.freeze(
    Array.from({ length: total }, (_, repetition) =>
      Object.freeze({
        phase: repetition < options.warmups ? "warmup" : "measured",
        repetition,
        heapUsed: heapUsedSamples[repetition]!,
        codeAndMetadataSize: codeAndMetadataSamples[repetition]!,
        bytecodeAndMetadataSize: bytecodeAndMetadataSamples[repetition]!,
        retainedHeapUsed: retainedHeapUsedSamples[repetition]!,
        rss: rssSamples[repetition]!,
      }),
    ),
  );
  // Result paths are deterministic, so materialize them only after every heap
  // sample instead of growing a string array inside the measured window.
  const measuredPaths = Array.from({ length: options.repetitions }, (_, index) =>
    path.join(evidenceDirectory, `${options.warmups + index}.json`),
  );
  const measured = await Promise.all(
    measuredPaths.map(
      async (resultPath) => JSON.parse(await readFile(resultPath, "utf8")) as JourneyExecution,
    ),
  );

  const latencySamples = measured.flatMap((result) => result.actionLatencies);
  const heartbeatSamples = measured.flatMap((result) => result.heartbeatExcess);
  const renderSamples = measured.flatMap((result) => result.renderDurations);
  const evidence: WorkerEvidence = Object.freeze({
    journey: options.journey,
    kind: options.kind,
    warmups: options.warmups,
    repetitions: options.repetitions,
    maxFps: options.maxFps,
    ...(options.volume === undefined ? {} : { volume: options.volume }),
    v8Flags: capacityWorkerV8Flags,
    measured: Object.freeze(measured),
    memory: Object.freeze(memory),
    memoryTrend: memoryTrend(memory),
    latency: summarize(latencySamples),
    heartbeat: summarize(heartbeatSamples),
    renderDuration: summarize(renderSamples),
  });

  process.stdout.write(`${JSON.stringify(evidence)}\n`);
} finally {
  try {
    await server.close();
  } finally {
    await rm(evidenceDirectory, { recursive: true, force: true });
  }
}
