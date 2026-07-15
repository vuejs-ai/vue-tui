import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite-plus";
import type { CapacityJourneyId, CapacityVolume, JourneyExecution } from "./workloads.tsx";
import { median, summarize } from "./metrics.ts";

interface WorkerOptions {
  readonly journey: CapacityJourneyId;
  readonly kind: "journey" | "control";
  readonly warmups: number;
  readonly repetitions: number;
  readonly maxFps: number;
  readonly volume?: CapacityVolume;
}

interface MemorySample {
  readonly phase: "warmup" | "measured";
  readonly repetition: number;
  readonly heapUsed: number;
  readonly rss: number;
}

interface MemoryTrend {
  readonly sampleCount: number;
  readonly firstThreeHeapMedian: number;
  readonly finalThreeHeapMedian: number;
  readonly heapDelta: number;
}

interface WorkerEvidence {
  readonly journey: CapacityJourneyId;
  readonly kind: "journey" | "control";
  readonly warmups: number;
  readonly repetitions: number;
  readonly maxFps: number;
  readonly volume?: CapacityVolume;
  readonly measured: readonly JourneyExecution[];
  readonly memory: readonly MemorySample[];
  readonly memoryTrend: MemoryTrend;
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

function collectMemory(phase: MemorySample["phase"], repetition: number): MemorySample {
  if (!globalThis.gc) throw new Error("capacity workers require node --expose-gc");
  globalThis.gc();
  const usage = process.memoryUsage();
  return Object.freeze({ phase, repetition, heapUsed: usage.heapUsed, rss: usage.rss });
}

function memoryTrend(samples: readonly MemorySample[]): MemoryTrend {
  const measured = samples.filter((sample) => sample.phase === "measured");
  const firstThreeHeapMedian = median(measured.slice(0, 3).map((sample) => sample.heapUsed));
  const finalThreeHeapMedian = median(measured.slice(-3).map((sample) => sample.heapUsed));
  return Object.freeze({
    sampleCount: measured.length,
    firstThreeHeapMedian,
    finalThreeHeapMedian,
    heapDelta: finalThreeHeapMedian - firstThreeHeapMedian,
  });
}

const options = parseOptions();
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
  const measuredPaths: string[] = [];
  const memory: MemorySample[] = [];
  const total = options.warmups + options.repetitions;

  async function runRepetition(repetition: number): Promise<string | null> {
    const result = await loaded[
      options.kind === "control" ? "runCapacityControl" : "runCapacityJourney"
    ](options.journey, options.maxFps, options.volume);
    if (repetition < options.warmups) return null;
    const resultPath = path.join(evidenceDirectory, `${repetition}.json`);
    await writeFile(resultPath, JSON.stringify(result));
    return resultPath;
  }

  for (let repetition = 0; repetition < total; repetition++) {
    // Spool the complete execution evidence outside the JS heap before the
    // sample. Retaining every prior latency/heartbeat/render array here made
    // the measurement observe its own evidence accumulator rather than only
    // Runtime and host state that survived teardown.
    const measuredPath = await runRepetition(repetition);
    const phase = repetition < options.warmups ? "warmup" : "measured";
    memory.push(collectMemory(phase, repetition));
    if (measuredPath !== null) measuredPaths.push(measuredPath);
  }

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
