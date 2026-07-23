import { assertColor } from "./color.ts";
import type { BoxProps } from "./box-props.ts";
import { MAX_LAYOUT_VALUE } from "../numeric-limits.ts";

const percentageWidthPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?%$/;

const flexDirections = new Set(["row", "column"]);
const alignItemsValues = new Set(["center", "stretch"]);
const justifyContentValues = new Set(["flex-start", "center", "space-between"]);
const borderStyles = new Set(["single", "round"]);
const overflowValues = new Set(["visible", "hidden"]);
const displayValues = new Set(["flex", "none"]);
const positionValues = new Set(["absolute"]);

function isPercentageWidth(value: string): boolean {
  if (!percentageWidthPattern.test(value)) return false;

  const decimal = value.slice(0, -1);
  const dot = decimal.indexOf(".");
  const integer = dot === -1 ? decimal : decimal.slice(0, dot);
  if (integer.length < 3) return true;
  if (integer !== "100") return false;

  // Compare the decimal text itself instead of converting it to a JavaScript
  // number: a value just above 100 with enough fractional digits rounds to 100.
  return dot === -1 || /^0+$/.test(decimal.slice(dot + 1));
}

function propLabel(prop: string): string {
  return `<Box> prop "${prop}"`;
}

function assertCellCount(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value !== "number") {
    throw new TypeError(`${propLabel(prop)} must be a number.`);
  }
  if (!Number.isInteger(value) || value < 0 || value > MAX_LAYOUT_VALUE) {
    throw new RangeError(
      `${propLabel(prop)} must be an integer between 0 and ${MAX_LAYOUT_VALUE}.`,
    );
  }
}

function assertSignedCellCount(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value !== "number") {
    throw new TypeError(`${propLabel(prop)} must be a number.`);
  }
  if (!Number.isInteger(value) || Math.abs(value) > MAX_LAYOUT_VALUE) {
    throw new RangeError(
      `${propLabel(prop)} must be an integer between -${MAX_LAYOUT_VALUE} and ${MAX_LAYOUT_VALUE}.`,
    );
  }
}

function assertFlexFactor(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value !== "number") {
    throw new TypeError(`${propLabel(prop)} must be a number.`);
  }
  if (!Number.isFinite(value) || value < 0 || value > MAX_LAYOUT_VALUE) {
    throw new RangeError(
      `${propLabel(prop)} must be a finite number between 0 and ${MAX_LAYOUT_VALUE}.`,
    );
  }
}

function assertEnum(value: unknown, prop: string, values: ReadonlySet<string>): void {
  if (value === undefined) return;
  if (typeof value !== "string") {
    throw new TypeError(`${propLabel(prop)} must be a string.`);
  }
  if (!values.has(value)) {
    throw new Error(`Unsupported ${propLabel(prop)} value: ${JSON.stringify(value)}.`);
  }
}

function assertWidth(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === "number") {
    assertCellCount(value, "width");
    return;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${propLabel("width")} must be a number or percentage string.`);
  }
  if (!isPercentageWidth(value)) {
    throw new Error(`Unsupported ${propLabel("width")} value: ${JSON.stringify(value)}.`);
  }
}

/** Validate the small public Box vocabulary before Vue patches a host node. */
export function assertBoxValid(props: BoxProps): true {
  const values = props as Record<string, unknown>;

  assertEnum(values["flexDirection"], "flexDirection", flexDirections);
  assertFlexFactor(values["flexGrow"], "flexGrow");
  assertFlexFactor(values["flexShrink"], "flexShrink");
  assertCellCount(values["flexBasis"], "flexBasis");
  assertEnum(values["alignItems"], "alignItems", alignItemsValues);
  assertEnum(values["justifyContent"], "justifyContent", justifyContentValues);
  assertCellCount(values["gap"], "gap");

  assertWidth(values["width"]);
  assertCellCount(values["height"], "height");
  assertCellCount(values["minWidth"], "minWidth");
  assertCellCount(values["minHeight"], "minHeight");
  assertEnum(values["position"], "position", positionValues);
  assertSignedCellCount(values["top"], "top");
  assertSignedCellCount(values["left"], "left");
  if (
    (values["top"] !== undefined || values["left"] !== undefined) &&
    values["position"] !== "absolute"
  ) {
    throw new Error('<Box> props "top" and "left" require position="absolute".');
  }

  assertSignedCellCount(values["marginTop"], "marginTop");
  for (const prop of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"] as const) {
    assertCellCount(values[prop], prop);
  }

  assertEnum(values["overflowY"], "overflowY", overflowValues);
  assertEnum(values["display"], "display", displayValues);
  assertEnum(values["borderStyle"], "borderStyle", borderStyles);
  if (values["borderColor"] !== undefined)
    assertColor(values["borderColor"], propLabel("borderColor"));
  if (values["backgroundColor"] !== undefined) {
    assertColor(values["backgroundColor"], propLabel("backgroundColor"));
  }

  return true;
}
