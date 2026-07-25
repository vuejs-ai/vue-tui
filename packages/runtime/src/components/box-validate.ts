import { MAX_LAYOUT_VALUE } from "../numeric-limits.ts";
import { assertColor } from "./color.ts";
import type { BoxProps } from "./box-props.ts";

const percentagePattern = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?%$/;

const flexDirections = new Set(["row", "column", "row-reverse", "column-reverse"]);
const flexWrapValues = new Set(["nowrap", "wrap", "wrap-reverse"]);
const alignItemsValues = new Set(["flex-start", "center", "flex-end", "stretch"]);
const alignSelfValues = new Set(["auto", ...alignItemsValues]);
const justifyContentValues = new Set([
  "flex-start",
  "center",
  "flex-end",
  "space-between",
  "space-around",
  "space-evenly",
]);
const positionValues = new Set(["relative", "absolute", "static"]);
const alignContentValues = new Set([
  "flex-start",
  "center",
  "flex-end",
  "stretch",
  "space-between",
  "space-around",
  "space-evenly",
]);
const borderStyles = new Set([
  "single",
  "double",
  "round",
  "bold",
  "singleDouble",
  "doubleSingle",
  "classic",
  "arrow",
]);
// A custom frame must supply every corner and edge so it cannot silently lose a
// side. Each value is one string; width is the renderer's business, not the
// caller's, so no numeric or multi-character contract is promised here.
const borderCharacterKeys = [
  "topLeft",
  "top",
  "topRight",
  "right",
  "bottomRight",
  "bottom",
  "bottomLeft",
  "left",
] as const;

function assertBorderStyle(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === "string") {
    assertEnum(value, "borderStyle", borderStyles);
    return;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(
      `${propLabel("borderStyle")} must be a known frame name or a complete frame object.`,
    );
  }
  const frame = value as Record<string, unknown>;
  for (const key of borderCharacterKeys) {
    if (typeof frame[key] !== "string") {
      throw new TypeError(
        `${propLabel("borderStyle")} frame is missing a string "${key}" character.`,
      );
    }
  }
  for (const key of Reflect.ownKeys(frame)) {
    if (typeof key === "symbol" || !(borderCharacterKeys as readonly string[]).includes(key)) {
      throw new TypeError(
        `${propLabel("borderStyle")} frame has an unknown character ${JSON.stringify(String(key))}.`,
      );
    }
  }
}
const overflowValues = new Set(["visible", "hidden"]);

function propLabel(prop: string): string {
  return `<Box> prop "${prop}"`;
}

/**
 * Apply one private finite range envelope to every numeric value before it can
 * reach Yoga. Public layout cells are integral; flex factors share the same
 * finite ceiling but may be fractional.
 */
function assertLayoutNumber(
  value: unknown,
  prop: string,
  minimum: number,
  maximum: number,
  integer: boolean,
): asserts value is number {
  if (typeof value !== "number") {
    throw new TypeError(`${propLabel(prop)} must be a number.`);
  }
  if (
    !Number.isFinite(value) ||
    (integer && !Number.isInteger(value)) ||
    value < minimum ||
    value > maximum
  ) {
    const kind = integer ? "integer" : "finite number";
    throw new RangeError(`${propLabel(prop)} must be a ${kind} between ${minimum} and ${maximum}.`);
  }
}

function assertCellCount(value: unknown, prop: string): void {
  if (value === undefined) return;
  assertLayoutNumber(value, prop, 0, MAX_LAYOUT_VALUE, true);
}

function assertSignedCellCount(value: unknown, prop: string): void {
  if (value === undefined) return;
  assertLayoutNumber(value, prop, -MAX_LAYOUT_VALUE, MAX_LAYOUT_VALUE, true);
}

function assertFlexFactor(value: unknown, prop: string): void {
  if (value === undefined) return;
  assertLayoutNumber(value, prop, 0, MAX_LAYOUT_VALUE, false);
}

function decimalExceeds(integer: string, fraction: string | undefined, maximum: number): boolean {
  const maximumText = String(maximum);
  if (integer.length !== maximumText.length) return integer.length > maximumText.length;
  if (integer !== maximumText) return integer > maximumText;
  return fraction !== undefined && /[1-9]/.test(fraction);
}

function assertPercentage(
  value: string,
  prop: string,
  options: { readonly signed: boolean; readonly maximum: number },
): void {
  const match = percentagePattern.exec(value);
  if (!match || (!options.signed && match[1] === "-")) {
    throw new Error(`Unsupported ${propLabel(prop)} value: ${JSON.stringify(value)}.`);
  }
  if (decimalExceeds(match[2]!, match[3], options.maximum)) {
    const minimum = options.signed ? `-${options.maximum}%` : "0%";
    throw new RangeError(
      `${propLabel(prop)} must be a canonical percentage between ${minimum} and ${options.maximum}%.`,
    );
  }
}

function assertDimension(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value === "number") {
    assertLayoutNumber(value, prop, 0, MAX_LAYOUT_VALUE, true);
    return;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${propLabel(prop)} must be a number or percentage string.`);
  }
  assertPercentage(value, prop, { signed: false, maximum: 100 });
}

function assertOffset(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value === "number") {
    assertLayoutNumber(value, prop, -MAX_LAYOUT_VALUE, MAX_LAYOUT_VALUE, true);
    return;
  }
  if (typeof value !== "string") {
    throw new TypeError(`${propLabel(prop)} must be a number or percentage string.`);
  }
  assertPercentage(value, prop, { signed: true, maximum: MAX_LAYOUT_VALUE });
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

function assertBoolean(value: unknown, prop: string): void {
  if (value === undefined) return;
  if (typeof value !== "boolean") {
    throw new TypeError(`${propLabel(prop)} must be a boolean.`);
  }
}

/** Validate the complete public Box vocabulary before Vue patches a host node. */
export function assertBoxValid(props: BoxProps): true {
  const values = props as Record<string, unknown>;

  assertEnum(values["flexDirection"], "flexDirection", flexDirections);
  assertEnum(values["flexWrap"], "flexWrap", flexWrapValues);
  assertFlexFactor(values["flexGrow"], "flexGrow");
  assertFlexFactor(values["flexShrink"], "flexShrink");
  assertDimension(values["flexBasis"], "flexBasis");
  assertEnum(values["alignItems"], "alignItems", alignItemsValues);
  assertEnum(values["alignSelf"], "alignSelf", alignSelfValues);
  assertEnum(values["justifyContent"], "justifyContent", justifyContentValues);
  assertEnum(values["alignContent"], "alignContent", alignContentValues);
  for (const prop of ["gap", "rowGap", "columnGap"] as const) {
    assertCellCount(values[prop], prop);
  }

  assertDimension(values["width"], "width");
  for (const prop of ["height", "minWidth", "minHeight", "maxWidth", "maxHeight"] as const) {
    assertCellCount(values[prop], prop);
  }
  // A ratio is not a cell count: it is fractional by nature and shares the same
  // finite envelope as the flex factors.
  assertFlexFactor(values["aspectRatio"], "aspectRatio");

  assertEnum(values["position"], "position", positionValues);
  for (const prop of ["top", "right", "bottom", "left"] as const) {
    assertOffset(values[prop], prop);
  }

  for (const prop of [
    "margin",
    "marginX",
    "marginY",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ] as const) {
    assertSignedCellCount(values[prop], prop);
  }
  for (const prop of [
    "padding",
    "paddingX",
    "paddingY",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ] as const) {
    assertCellCount(values[prop], prop);
  }

  assertBorderStyle(values["borderStyle"]);
  for (const prop of ["borderTop", "borderRight", "borderBottom", "borderLeft"] as const) {
    assertBoolean(values[prop], prop);
  }
  for (const prop of [
    "borderTopDimColor",
    "borderRightDimColor",
    "borderBottomDimColor",
    "borderLeftDimColor",
    "borderDimColor",
  ] as const) {
    assertBoolean(values[prop], prop);
  }
  for (const prop of [
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "borderBackgroundColor",
    "borderTopBackgroundColor",
    "borderRightBackgroundColor",
    "borderBottomBackgroundColor",
    "borderLeftBackgroundColor",
  ] as const) {
    if (values[prop] !== undefined) assertColor(values[prop], propLabel(prop));
  }
  if (values["backgroundColor"] !== undefined) {
    assertColor(values["backgroundColor"], propLabel("backgroundColor"));
  }
  for (const prop of ["overflow", "overflowX", "overflowY"] as const) {
    assertEnum(values[prop], prop, overflowValues);
  }

  return true;
}
