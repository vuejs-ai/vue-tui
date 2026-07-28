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
