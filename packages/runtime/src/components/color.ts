const namedColors = new Set([
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
]);

export type NamedColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "redBright"
  | "greenBright"
  | "yellowBright"
  | "blueBright"
  | "magentaBright"
  | "cyanBright"
  | "whiteBright";

/**
 * A terminal color accepted by Runtime.
 *
 * Hex colors are checked at runtime and must contain exactly six hexadecimal
 * digits. TypeScript cannot express that finite grammar without constructing a
 * prohibitively large union, so the template-literal arm deliberately narrows
 * only the leading `#`.
 */
export type Color = NamedColor | `#${string}`;

const rgbColorPattern = /^#[0-9a-fA-F]{6}$/;

export function isColor(value: unknown): value is Color {
  return typeof value === "string" && (namedColors.has(value) || rgbColorPattern.test(value));
}

export function assertColor(value: unknown, prop: string): asserts value is Color {
  if (typeof value !== "string") {
    throw new TypeError(`${prop} must be a terminal color string.`);
  }
  if (!isColor(value)) {
    throw new Error(`Unsupported ${prop}: ${JSON.stringify(value)}.`);
  }
}
