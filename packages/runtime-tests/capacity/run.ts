import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { capacityManifest, type CapacityJourneyId, type CapacityVolume } from "./workloads.tsx";
import { assessCapacityRun, capacityThresholds, type CapacityWorkerEvidence } from "./policy.ts";
import { selectCapacityRunSpecs } from "./run-selection.ts";

interface RunConfiguration {
  readonly mode: "check" | "measure";
  readonly warmups: number;
  readonly repetitions: number;
  readonly maxFps: number;
  readonly enforceTiming: boolean;
}

function requestedMode(): RunConfiguration["mode"] {
  const check = process.argv.includes("--check");
  const measure = process.argv.includes("--measure");
  if (check === measure) throw new Error("pass exactly one of --check or --measure");
  return check ? "check" : "measure";
}

function requestedJourneyArgument(): string | undefined {
  const index = process.argv.indexOf("--journeys");
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new TypeError("--journeys requires a comma-separated value");
  }
  return value;
}

function configuration(
  mode: RunConfiguration["mode"],
  journey: CapacityJourneyId,
): RunConfiguration {
  if (journey === "j6i" || journey === "j6f") {
    return Object.freeze({
      mode,
      warmups: 0,
      repetitions: capacityManifest[journey].repetitions,
      maxFps: 0,
      enforceTiming: false,
    });
  }
  return mode === "check"
    ? Object.freeze({
        mode: "check" as const,
        warmups: 0,
        repetitions: 1,
        maxFps: 0,
        enforceTiming: false,
      })
    : Object.freeze({
        mode: "measure" as const,
        warmups: 3,
        repetitions: 10,
        maxFps: 30,
        enforceTiming: true,
      });
}

async function runWorker(
  journey: CapacityJourneyId,
  volume: CapacityVolume | undefined,
  kind: "journey" | "control",
  options: RunConfiguration,
): Promise<CapacityWorkerEvidence> {
  const worker = fileURLToPath(new URL("./worker.ts", import.meta.url));
  const args = [
    "--expose-gc",
    "--import=tsx",
    worker,
    "--journey",
    journey,
    "--warmups",
    String(options.warmups),
    "--repetitions",
    String(options.repetitions),
    "--max-fps",
    String(options.maxFps),
  ];
  if (volume !== undefined) args.push("--volume", volume);
  if (kind === "control") args.push("--control");
  const label = volume === undefined ? journey : `${journey}-${volume}`;
  process.stderr.write(
    `[capacity] ${options.mode} ${label} ${kind} (${options.warmups} warmups + ${options.repetitions} measured)\n`,
  );
  const child = spawn(process.execPath, args, {
    cwd: path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))),
    env: { ...process.env, FORCE_COLOR: "0", CI: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`${label} ${kind} worker exited ${exitCode}${stderr ? `\n${stderr}` : ""}`);
  }
  const line = stdout.trim().split("\n").at(-1);
  if (!line) throw new Error(`${label} ${kind} worker produced no evidence`);
  return JSON.parse(line) as CapacityWorkerEvidence;
}

function gitText(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const mode = requestedMode();
const runs = [];
for (const spec of selectCapacityRunSpecs(requestedJourneyArgument())) {
  const options = configuration(mode, spec.journey);
  const workload = await runWorker(spec.journey, spec.volume, "journey", options);
  const control = await runWorker(spec.journey, spec.volume, "control", options);
  const assessment = assessCapacityRun(spec.journey, workload, control, options.enforceTiming);
  const label = spec.volume === undefined ? spec.journey : `${spec.journey}-${spec.volume}`;
  process.stderr.write(`[capacity] ${mode} ${label} ${assessment.status}\n`);
  runs.push(
    Object.freeze({
      journey: spec.journey,
      ...(spec.volume === undefined ? {} : { volume: spec.volume }),
      configuration: options,
      workload,
      control,
      assessment,
    }),
  );
}

const evidence = Object.freeze({
  schemaVersion: 3,
  recordedAt: new Date().toISOString(),
  mode,
  thresholds: capacityThresholds,
  environment: Object.freeze({
    commit: gitText("rev-parse", "HEAD"),
    dirty: gitText("status", "--porcelain").length > 0,
    node: process.version,
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model ?? "unknown",
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  }),
  runs: Object.freeze(runs),
});

process.stdout.write(`${JSON.stringify(evidence)}\n`);
if (
  runs.some(
    (run) =>
      run.assessment.status === "fail" ||
      (run.configuration.enforceTiming && run.assessment.status !== "pass"),
  )
) {
  process.exitCode = 1;
}
