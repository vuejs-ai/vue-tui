import type { TextProps } from "./text-props.ts";
import { assertColor } from "./color.ts";

const wrapModes = new Set(["wrap", "truncate"]);

function label(prop: string): string {
  return `<Text> prop "${prop}"`;
}

function assertBoolean(value: unknown, prop: string): void {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label(prop)} must be a boolean.`);
  }
}

export function assertTextValid(props: TextProps, validatePaint: boolean): true {
  const values = props as Record<string, unknown>;
  const wrap = values["wrap"];
  if (typeof wrap !== "string") {
    throw new TypeError(`${label("wrap")} must be a string.`);
  }
  if (!wrapModes.has(wrap)) {
    throw new Error(`Unsupported ${label("wrap")} value: ${JSON.stringify(wrap)}.`);
  }

  if (typeof values["ariaLabel"] !== "undefined" && typeof values["ariaLabel"] !== "string") {
    throw new TypeError(`${label("ariaLabel")} must be a string.`);
  }
  assertBoolean(values["ariaHidden"], "ariaHidden");

  if (validatePaint) {
    const color = values["color"];
    if (color !== undefined && color !== "revert" && color !== "initial") {
      assertColor(color, label("color"));
    }
    if (values["backgroundColor"] !== undefined) {
      assertColor(values["backgroundColor"], label("backgroundColor"));
    }
    assertBoolean(values["dimColor"], "dimColor");
    assertBoolean(values["bold"], "bold");
    assertBoolean(values["inverse"], "inverse");
  }

  return true;
}
