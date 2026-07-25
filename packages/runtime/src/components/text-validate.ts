import { assertColor } from "./color.ts";
import type { TextProps } from "./text-props.ts";

const wrapModes = new Set(["wrap", "hard", "truncate", "truncate-middle", "truncate-start"]);

function label(prop: string): string {
  return `<Text> prop "${prop}"`;
}

function assertBoolean(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new TypeError(`${label(prop)} must be a boolean.`);
  }
}

function assertTextColor(value: unknown, prop: string): void {
  if (value === undefined || value === "default") return;
  assertColor(value, label(prop));
}

export function assertTextValid(props: TextProps): true {
  const values = props as Record<string, unknown>;
  const wrap = values["wrap"];
  if (typeof wrap !== "string") {
    throw new TypeError(`${label("wrap")} must be a string.`);
  }
  if (!wrapModes.has(wrap)) {
    throw new Error(`Unsupported ${label("wrap")} value: ${JSON.stringify(wrap)}.`);
  }

  assertTextColor(values["color"], "color");
  assertTextColor(values["backgroundColor"], "backgroundColor");
  for (const prop of [
    "dimColor",
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "inverse",
  ] as const) {
    assertBoolean(values[prop], prop);
  }

  return true;
}
