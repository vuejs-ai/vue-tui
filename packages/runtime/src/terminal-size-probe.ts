import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import tty from "node:tty";

export type TerminalSizeProbeSource =
  | "process-stdout"
  | "process-stderr"
  | "environment"
  | "controlling-tty"
  | "tput"
  | "resize";

export type TerminalSizeProbeResult =
  | {
      readonly kind: "detected";
      readonly size: {
        readonly columns: number;
        readonly rows: number;
      };
      readonly source: TerminalSizeProbeSource;
    }
  | { readonly kind: "unavailable" };

/** Test-only mount seam for deterministic live-host resolution. */
export const INTERNAL_TERMINAL_SIZE_PROBE = Symbol("vue-tui:terminal-size-probe");
export type TerminalSizeProbe = () => TerminalSizeProbeResult;

interface TerminalSizeCandidate {
  readonly columns?: unknown;
  readonly rows?: unknown;
}

interface RunCommandOptions {
  readonly env: NodeJS.ProcessEnv;
}

/** Dependencies are injectable so source ordering can be tested without reading the host terminal. */
export interface TerminalSizeProbeDependencies {
  readonly platform: NodeJS.Platform;
  readonly stdout: TerminalSizeCandidate | undefined;
  readonly stderr: TerminalSizeCandidate | undefined;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly readControllingTtySize: () => TerminalSizeCandidate | undefined;
  readonly runCommand: (
    command: string,
    arguments_: readonly string[],
    options?: RunCommandOptions,
  ) => string;
  readonly isForegroundProcess: () => boolean;
}

const ambiguousDefaultSize = { columns: 80, rows: 24 } as const;

function toPositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parsePositiveSize(candidate: TerminalSizeCandidate | undefined) {
  const columns = toPositiveInteger(candidate?.columns);
  const rows = toPositiveInteger(candidate?.rows);
  return columns === undefined || rows === undefined ? undefined : { columns, rows };
}

function detected(
  candidate: TerminalSizeCandidate | undefined,
  source: TerminalSizeProbeSource,
  rejectAmbiguousDefault = false,
): TerminalSizeProbeResult | undefined {
  const size = parsePositiveSize(candidate);
  if (!size) return undefined;
  if (
    rejectAmbiguousDefault &&
    size.columns === ambiguousDefaultSize.columns &&
    size.rows === ambiguousDefaultSize.rows
  ) {
    return undefined;
  }
  return { kind: "detected", size, source };
}

function readControllingTtySize(platform: NodeJS.Platform): TerminalSizeCandidate | undefined {
  let descriptor: number | undefined;
  let stream: tty.WriteStream | undefined;
  try {
    // terminal-size@4 uses a non-blocking descriptor so a missing or detached controlling
    // terminal fails promptly instead of blocking application startup.
    // Node exposes O_EVTONLY on macOS at runtime, but @types/node omits the platform-specific
    // constant. O_RDONLY is the safe fallback if a compatible runtime does not expose it.
    const eventOnly =
      (fs.constants as typeof fs.constants & { readonly O_EVTONLY?: number }).O_EVTONLY ??
      fs.constants.O_RDONLY;
    const flags =
      platform === "darwin" ? eventOnly | fs.constants.O_NONBLOCK : fs.constants.O_NONBLOCK;
    descriptor = fs.openSync("/dev/tty", flags);
    stream = new tty.WriteStream(descriptor);
    return { columns: stream.columns, rows: stream.rows };
  } catch {
    return undefined;
  } finally {
    if (stream) {
      stream.destroy();
    } else if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The failed stream constructor may already have taken ownership.
      }
    }
  }
}

function runCommand(
  command: string,
  arguments_: readonly string[],
  options?: RunCommandOptions,
): string {
  return execFileSync(command, [...arguments_], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 500,
    env: options?.env,
  }).trim();
}

function isForegroundProcess(): boolean {
  if (process.platform !== "linux") return true;

  try {
    const statContents = fs.readFileSync("/proc/self/stat", "utf8");
    const closingParenthesisIndex = statContents.lastIndexOf(") ");
    if (closingParenthesisIndex === -1) return false;

    const statFields = statContents
      .slice(closingParenthesisIndex + 2)
      .trim()
      .split(/\s+/);
    const processGroupId = Number.parseInt(statFields[2] ?? "", 10);
    const foregroundProcessGroupId = Number.parseInt(statFields[5] ?? "", 10);
    return (
      Number.isFinite(processGroupId) &&
      Number.isFinite(foregroundProcessGroupId) &&
      foregroundProcessGroupId > 0 &&
      processGroupId === foregroundProcessGroupId
    );
  } catch {
    return false;
  }
}

function createDefaultDependencies(): TerminalSizeProbeDependencies {
  return {
    platform: process.platform,
    stdout: process.stdout,
    stderr: process.stderr,
    env: process.env,
    readControllingTtySize: () => readControllingTtySize(process.platform),
    runCommand,
    isForegroundProcess,
  };
}

/**
 * Detect the controlling terminal's real dimensions and identify their source.
 *
 * The source order follows terminal-size@4, but its final 80x24 fallback is deliberately
 * omitted. Callers may choose 80 columns for layout; they must not claim that fallback as a
 * detected terminal window.
 */
export function probeControllingTerminalSize(
  overrides: Partial<TerminalSizeProbeDependencies> = {},
): TerminalSizeProbeResult {
  const dependencies = { ...createDefaultDependencies(), ...overrides };

  const stdoutResult = detected(dependencies.stdout, "process-stdout");
  if (stdoutResult) return stdoutResult;

  const stderrResult = detected(dependencies.stderr, "process-stderr");
  if (stderrResult) return stderrResult;

  const environmentResult = detected(
    { columns: dependencies.env.COLUMNS, rows: dependencies.env.LINES },
    "environment",
  );
  if (environmentResult) return environmentResult;

  if (dependencies.platform !== "win32") {
    try {
      const controllingTtyResult = detected(
        dependencies.readControllingTtySize(),
        "controlling-tty",
      );
      if (controllingTtyResult) return controllingTtyResult;
    } catch {
      // A process may have no controlling terminal. Continue with command-based probes.
    }
  }

  try {
    const commandEnvironment = { TERM: "dumb", ...dependencies.env };
    const columns = dependencies.runCommand("tput", ["cols"], { env: commandEnvironment });
    const rows = dependencies.runCommand("tput", ["lines"], { env: commandEnvironment });
    const tputResult = detected({ columns, rows }, "tput", true);
    if (tputResult) return tputResult;
  } catch {
    // tput may be absent or TERM may not describe a usable terminal.
  }

  if (dependencies.platform === "linux") {
    try {
      if (dependencies.isForegroundProcess()) {
        // Keep a leading minus sign so invalid negative dimensions cannot be reinterpreted as
        // positive merely because `resize` returned unexpected output.
        const values = dependencies.runCommand("resize", ["-u"]).match(/-?\d+/g);
        if (values?.length === 2) {
          const resizeResult = detected({ columns: values[0], rows: values[1] }, "resize", true);
          if (resizeResult) return resizeResult;
        }
      }
    } catch {
      // resize is optional and querying process foreground state can fail in restricted hosts.
    }
  }

  return { kind: "unavailable" };
}
