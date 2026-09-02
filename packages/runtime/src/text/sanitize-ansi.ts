import { tokenizeAnsi, hasAnsiControlCharacters, type AnsiToken } from "./ansi-tokenizer.ts";
import type { TerminalStyle } from "../paint/terminal-style.ts";

const sgrParametersRegex = /^[\d:;]*$/;
const singleLineControlCharactersRegex = /[\u0000-\u001f\u007f]/g;
const multilineControlCharactersRegex = /[\u0000-\u0009\u000b-\u001f\u007f]/g;

export interface SanitizeAnsiOptions {
  /** Strip every plain-text C0/DEL byte so the result cannot change physical rows. */
  singleLine?: boolean;
  /** Constrain retained SGR to one render session's resolved capability. */
  terminalStyle?: TerminalStyle;
}

type ControlCharacterMode = "preserve" | "single-line" | "multiline";

function stripPlainControls(text: string, mode: ControlCharacterMode): string {
  if (mode === "single-line") return text.replace(singleLineControlCharactersRegex, "");
  if (mode === "multiline") return text.replace(multilineControlCharactersRegex, "");
  return text;
}

function hasSafeOscPayload(value: string): boolean {
  const start = value.startsWith("\x1b]") ? 2 : 1;
  const end = value.endsWith("\x1b\\") ? value.length - 2 : value.length - 1;
  const payload = value.slice(start, end);
  // wrap-ansi understands OSC 8 hyperlinks and keeps their tokens intact while
  // wrapping. Other OSC commands (title, clipboard, working directory, etc.)
  // can be split into visible fragments by wrapping and have terminal-wide
  // side effects, so geometry-safe paths reserve them for the raw-stream bypass.
  return payload.startsWith("8;") && !/[\u0000-\u001f\u007f-\u009f]/.test(payload);
}

type ColorChannel = "foreground" | "background" | "underline";

interface IndexedColor {
  readonly channel: ColorChannel;
  readonly kind: "indexed";
  readonly value: number;
}

interface RgbColor {
  readonly blue: number;
  readonly channel: ColorChannel;
  readonly green: number;
  readonly kind: "rgb";
  readonly red: number;
}

type ExtendedColor = IndexedColor | RgbColor;

type SgrOperation =
  | { readonly kind: "color"; readonly value: ExtendedColor }
  | { readonly kind: "parameter"; readonly value: string };

const ansi16Palette = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
] as const;

function colorChannel(value: string): ColorChannel | undefined {
  if (value === "38") return "foreground";
  if (value === "48") return "background";
  if (value === "58") return "underline";
  return undefined;
}

function boundedByte(value: string): number | undefined {
  if (!/^\d+$/.test(value)) return undefined;
  return Math.min(255, Number(value));
}

function parseColonColor(parameter: string): ExtendedColor | undefined {
  const parts = parameter.split(":");
  const channel = colorChannel(parts[0] ?? "");
  if (!channel) return undefined;

  if (parts[1] === "5") {
    const value = boundedByte(parts.at(-1) ?? "");
    return value === undefined ? undefined : { channel, kind: "indexed", value };
  }
  if (parts[1] !== "2" || parts.length < 5) return undefined;

  const red = boundedByte(parts.at(-3) ?? "");
  const green = boundedByte(parts.at(-2) ?? "");
  const blue = boundedByte(parts.at(-1) ?? "");
  return red === undefined || green === undefined || blue === undefined
    ? undefined
    : { blue, channel, green, kind: "rgb", red };
}

function parseSgrOperations(parameterString: string): SgrOperation[] | undefined {
  const parts = parameterString === "" ? ["0"] : parameterString.split(";");
  const operations: SgrOperation[] = [];

  for (let index = 0; index < parts.length; index++) {
    const parameter = parts[index] ?? "";
    if (parameter.includes(":")) {
      const channel = colorChannel(parameter.split(":", 1)[0] ?? "");
      if (!channel) {
        operations.push({ kind: "parameter", value: parameter });
        continue;
      }
      const color = parseColonColor(parameter);
      if (!color) return undefined;
      operations.push({ kind: "color", value: color });
      continue;
    }

    const channel = colorChannel(parameter);
    if (!channel) {
      operations.push({ kind: "parameter", value: parameter === "" ? "0" : parameter });
      continue;
    }

    const mode = parts[index + 1];
    if (mode === "5") {
      const value = boundedByte(parts[index + 2] ?? "");
      if (value === undefined) return undefined;
      operations.push({
        kind: "color",
        value: { channel, kind: "indexed", value },
      });
      index += 2;
      continue;
    }
    if (mode === "2") {
      const hasColorSpace = parts[index + 2] === "";
      const componentStart = index + (hasColorSpace ? 3 : 2);
      const red = boundedByte(parts[componentStart] ?? "");
      const green = boundedByte(parts[componentStart + 1] ?? "");
      const blue = boundedByte(parts[componentStart + 2] ?? "");
      if (red === undefined || green === undefined || blue === undefined) return undefined;
      operations.push({
        kind: "color",
        value: { blue, channel, green, kind: "rgb", red },
      });
      index = componentStart + 2;
      continue;
    }

    // An unknown extended-color mode is still a color request. Drop the whole
    // SGR token at constrained levels rather than leaking a capability we do
    // not understand or reinterpreting its operands as unrelated attributes.
    return undefined;
  }

  return operations;
}

function indexedColorToRgb(value: number): readonly [red: number, green: number, blue: number] {
  if (value < 16) return ansi16Palette[value]!;
  if (value >= 232) {
    const gray = 8 + (value - 232) * 10;
    return [gray, gray, gray];
  }
  const offset = value - 16;
  const component = (part: number): number => (part === 0 ? 0 : 55 + part * 40);
  return [
    component(Math.floor(offset / 36)),
    component(Math.floor((offset % 36) / 6)),
    component(offset % 6),
  ];
}

function openingCode(styled: string): string | undefined {
  const markerIndex = styled.indexOf("x");
  return markerIndex <= 0 ? undefined : styled.slice(0, markerIndex);
}

function convertedColorCode(color: ExtendedColor, style: TerminalStyle): string | undefined {
  if (style.colorLevel === 0) return undefined;
  if (color.channel === "underline" && style.colorLevel === 1) return undefined;

  const [red, green, blue] =
    color.kind === "rgb" ? [color.red, color.green, color.blue] : indexedColorToRgb(color.value);
  const marker = "x";
  const styled =
    color.channel === "background"
      ? style.chalk.bgRgb(red, green, blue)(marker)
      : style.chalk.rgb(red, green, blue)(marker);
  const opening = openingCode(styled);
  if (!opening) return undefined;
  return color.channel === "underline" ? opening.replace("[38;", "[58;") : opening;
}

function isBasicColorParameter(parameter: string): boolean {
  const value = Number(parameter);
  return (
    (value >= 30 && value <= 37) ||
    value === 39 ||
    (value >= 40 && value <= 47) ||
    value === 49 ||
    (value >= 90 && value <= 97) ||
    (value >= 100 && value <= 107) ||
    value === 59
  );
}

function constrainSgr(
  token: Extract<AnsiToken, { readonly type: "csi" }>,
  style: TerminalStyle,
): string {
  if (style.chalk.level === 0) return "";
  if (style.colorLevel === 3) return token.value;

  const operations = parseSgrOperations(token.parameterString);
  if (!operations) return "";

  let output = "";
  for (const operation of operations) {
    if (operation.kind === "color") {
      if (style.colorLevel === 2 && operation.value.kind === "indexed") {
        const channel =
          operation.value.channel === "foreground"
            ? 38
            : operation.value.channel === "background"
              ? 48
              : 58;
        output += `\x1b[${channel};5;${operation.value.value}m`;
      } else {
        output += convertedColorCode(operation.value, style) ?? "";
      }
      continue;
    }

    const parameter = operation.value;
    if (style.colorLevel === 0 && isBasicColorParameter(parameter)) continue;
    output += `\x1b[${parameter}m`;
  }
  return output;
}

function sanitizeAnsiWithControlMode(
  text: string,
  mode: ControlCharacterMode,
  terminalStyle?: TerminalStyle,
): string {
  if (!hasAnsiControlCharacters(text)) return stripPlainControls(text, mode);

  let output = "";

  for (const token of tokenizeAnsi(text)) {
    if (token.type === "text") {
      output += stripPlainControls(token.value, mode);
      continue;
    }

    if (token.type === "osc") {
      // OSC is non-geometric only while its payload contains no executable
      // control bytes. Geometry-safe paths keep OSC 8 hyperlinks but
      // drop control-bearing OSC; callers that need raw terminal protocols can
      // write through the returned stream directly.
      if (mode === "preserve" || hasSafeOscPayload(token.value)) output += token.value;
      continue;
    }

    if (
      token.type === "csi" &&
      token.finalCharacter === "m" &&
      token.intermediateString === "" &&
      sgrParametersRegex.test(token.parameterString)
    ) {
      output += terminalStyle ? constrainSgr(token, terminalStyle) : token.value;
    }
  }

  return output;
}

// Strip ANSI escape sequences that would conflict with vue-tui's layout.
// Preserved by default: SGR sequences (colors, bold, etc. - end with 'm') and
// OSC sequences (hyperlinks, etc. - ESC ] or C1 OSC). A supplied session style
// additionally removes or reduces SGR that exceeds its resolved capability.
// Stripped: cursor movement, screen clearing, and other control sequences.
export function sanitizeAnsi(text: string, options: SanitizeAnsiOptions = {}): string {
  return sanitizeAnsiWithControlMode(
    text,
    options.singleLine ? "single-line" : "preserve",
    options.terminalStyle,
  );
}

/** Preserve structural LF separators while stripping every other C0/DEL byte. */
export function sanitizeAnsiMultiline(text: string): string {
  return sanitizeAnsiWithControlMode(text, "multiline");
}
