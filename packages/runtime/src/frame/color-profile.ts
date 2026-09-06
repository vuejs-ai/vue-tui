/**
 * A fixed colored-terminal capability for one render session.
 *
 * - Boolean `color` values select automatic or plain output; profiles force a precise capability.
 * - Profiles constrain component styles and SGR already present in rendered text.
 *
 * @example Force 256-color output for one mount
 * ```ts
 * const color: ColorProfile = "ansi256";
 * app.mount({ color });
 * ```
 *
 * @example Force truecolor detached output
 * ```ts
 * const output = renderToString(Report, { color: "truecolor" });
 * ```
 */
export type ColorProfile = "ansi16" | "ansi256" | "truecolor";

export function normalizeColorOption(
  value: unknown,
  defaultValue: boolean,
  optionOwner: "Mount" | "renderToString",
): boolean | ColorProfile {
  if (value === undefined) return defaultValue;
  if (
    typeof value === "boolean" ||
    value === "ansi16" ||
    value === "ansi256" ||
    value === "truecolor"
  ) {
    return value;
  }
  throw new TypeError(
    `${optionOwner} option "color" must be a boolean, "ansi16", "ansi256", "truecolor", or undefined.`,
  );
}

/** Terminal color depth: none, ANSI 16, ANSI 256, truecolor. */
export type ColorLevel = 0 | 1 | 2 | 3;

/**
 * What the encoder of one host may emit, resolved once from the `color` option
 * and the environment. The painter never sees it: a cell carries structured
 * color, and degrading that color to this capability happens while encoding.
 */
export interface ColorCapability {
  /** `false` suppresses every SGR sequence, including the non-color attributes. */
  readonly attributes: boolean;
  /** Color depth. `0` keeps attributes while dropping color, which is what `NO_COLOR` selects. */
  readonly level: ColorLevel;
}

/** Build an explicit capability for Runtime-owned hosts and focused paint tests. */
export function createColorCapability(level: ColorLevel): ColorCapability {
  return Object.freeze({ attributes: level > 0, level });
}

interface ColorAwareStream {
  readonly isTTY?: boolean;
  readonly colorDepth?: number;
}

interface AutomaticColorInput {
  readonly color: true;
  readonly stdout: ColorAwareStream;
  readonly environment: Readonly<Record<string, string | undefined>>;
}

interface ExplicitColorInput {
  readonly color: false | ColorProfile;
}

type ColorCapabilityInput = AutomaticColorInput | ExplicitColorInput;

function levelForProfile(color: ColorProfile): ColorLevel {
  switch (color) {
    case "ansi16":
      return 1;
    case "ansi256":
      return 2;
    case "truecolor":
      return 3;
  }
}

function createColorSuppressedCapability(level: ColorLevel): ColorCapability {
  // NO_COLOR governs colors only. Bold, underline, and other non-color SGR
  // attributes remain available when the selected stream is a capable TTY.
  return Object.freeze({ attributes: level > 0, level: 0 });
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

/** Resolve one immutable color capability for mounted or detached rendering. */
export function resolveColorCapability(input: ColorCapabilityInput): ColorCapability {
  if (input.color === false) return createColorCapability(0);
  if (input.color !== true) return createColorCapability(levelForProfile(input.color));

  // Match Node's documented precedence: FORCE_COLOR is an explicit override.
  // Reading the variables here keeps detection out of any module-global,
  // import-time state.
  const forcedLevel = forcedColorLevel(input.environment.FORCE_COLOR);
  if (forcedLevel !== undefined) return createColorCapability(forcedLevel);

  const detectedLevel = detectTtyColorLevel(input.stdout, input.environment);
  if (
    (input.environment.NO_COLOR !== undefined && input.environment.NO_COLOR !== "") ||
    (input.environment.NODE_DISABLE_COLORS !== undefined &&
      input.environment.NODE_DISABLE_COLORS !== "")
  ) {
    return createColorSuppressedCapability(detectedLevel);
  }
  return createColorCapability(detectedLevel);
}
