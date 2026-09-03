import { Chalk, type ChalkInstance } from "chalk";
import type { ColorProfile } from "../frame/color-profile.ts";

export type ColorLevel = 0 | 1 | 2 | 3;

/** Resolved, session-owned text styling capability. */
export interface TerminalStyle {
  /** Maximum color capability. Non-color SGR may remain available at zero. */
  readonly colorLevel: ColorLevel;
  readonly chalk: ChalkInstance;
  /** Stable identity for caches whose cells depend on this capability. */
  readonly cacheKey: string;
}

interface ColorAwareStream {
  readonly isTTY?: boolean;
  readonly colorDepth?: number;
}

interface AutomaticTerminalStyleInput {
  readonly color: true;
  readonly stdout: ColorAwareStream;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

interface ExplicitTerminalStyleInput {
  readonly color: false | ColorProfile;
}

type TerminalStyleInput = AutomaticTerminalStyleInput | ExplicitTerminalStyleInput;

function createResolvedTerminalStyle(
  chalkLevel: ColorLevel,
  colorLevel: ColorLevel,
): TerminalStyle {
  const chalk = new Chalk({ level: chalkLevel });
  // Chalk exposes `level` as mutable, but changing it after paint-cache keys
  // have been formed would make cached bytes belong to a different capability.
  // Lock just this property; freezing the Chalk proxy would break its lazy styles.
  Object.defineProperty(chalk, "level", {
    configurable: false,
    value: chalkLevel,
    writable: false,
  });
  return Object.freeze({
    colorLevel,
    chalk,
    cacheKey: `${chalkLevel}:${colorLevel}`,
  });
}

/** Build an explicit capability for Runtime-owned hosts and focused paint tests. */
export function createTerminalStyle(level: ColorLevel): TerminalStyle {
  return createResolvedTerminalStyle(level, level);
}

function colorLevelForProfile(color: ColorProfile): ColorLevel {
  switch (color) {
    case "ansi16":
      return 1;
    case "ansi256":
      return 2;
    case "truecolor":
      return 3;
  }
}

function createColorSuppressedTerminalStyle(level: ColorLevel): TerminalStyle {
  return createResolvedTerminalStyle(level, 0);
}

function forcedColorLevel(value: string | undefined): ColorLevel | undefined {
  if (value === undefined) return undefined;
  if (value === "" || value === "true" || value === "1") return 1;
  if (value === "2") return 2;
  if (value === "3") return 3;
  return 0;
}

function environmentWithoutColorControls(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string | undefined> {
  const detectedEnvironment: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(environment)) {
    if (
      value === undefined ||
      name === "FORCE_COLOR" ||
      name === "NO_COLOR" ||
      name === "NODE_DISABLE_COLORS"
    ) {
      continue;
    }
    detectedEnvironment[name] = value;
  }
  return detectedEnvironment;
}

function colorLevelFromDepth(depth: number): ColorLevel {
  if (depth >= 24) return 3;
  if (depth >= 8) return 2;
  if (depth >= 4) return 1;
  return 0;
}

function detectTtyColorLevel(
  stdout: ColorAwareStream,
  environment: Readonly<Record<string, string | undefined>>,
): ColorLevel {
  if (!stdout.isTTY) return 0;
  const detectedEnvironment = environmentWithoutColorControls(environment);
  if (stdout.colorDepth !== undefined) {
    return colorLevelFromDepth(stdout.colorDepth);
  }
  if (detectedEnvironment.TERM === "dumb") return 0;
  if (/^(truecolor|24bit)$/i.test(detectedEnvironment.COLORTERM ?? "")) return 3;
  if (/256(?:color)?$/i.test(detectedEnvironment.TERM ?? "")) return 2;
  return 1;
}

/** Resolve one immutable styling capability for mounted or detached rendering. */
export function resolveTerminalStyle(input: TerminalStyleInput): TerminalStyle {
  if (input.color === false) return createTerminalStyle(0);
  if (input.color !== true) return createTerminalStyle(colorLevelForProfile(input.color));

  // Match Node's documented precedence: FORCE_COLOR is an explicit override.
  // Reading the variables ourselves avoids Chalk's module-global, import-time state.
  const forcedLevel = forcedColorLevel(input.environment.FORCE_COLOR);
  if (forcedLevel !== undefined) return createTerminalStyle(forcedLevel);

  const detectedLevel = detectTtyColorLevel(input.stdout, input.environment);
  if (
    (input.environment.NO_COLOR !== undefined && input.environment.NO_COLOR !== "") ||
    (input.environment.NODE_DISABLE_COLORS !== undefined &&
      input.environment.NODE_DISABLE_COLORS !== "")
  ) {
    // NO_COLOR governs colors only. Bold, underline, and other non-color SGR
    // attributes remain available when the selected stream is a capable TTY.
    return createColorSuppressedTerminalStyle(detectedLevel);
  }
  return createTerminalStyle(detectedLevel);
}
