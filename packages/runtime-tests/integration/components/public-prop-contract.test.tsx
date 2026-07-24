import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, renderToString } from "@vue-tui/runtime";

function renderBox(props: Record<string, unknown>): string {
  const App = defineComponent(
    () => () =>
      h(Box, props as never, { default: () => h(Text, null, { default: () => "content" }) }),
  );
  return renderToString(App, { width: 40 });
}

/**
 * Validate an empty target inside a fixed, clipped wrapper. This keeps exact
 * 65,535 boundaries away from the separate paint-surface allocation limit.
 */
function validateBox(props: Record<string, unknown>): void {
  const App = defineComponent(
    () => () =>
      h(Box, { width: 1, height: 1, overflow: "hidden" }, () =>
        h(Box, props as never, { default: () => undefined }),
      ),
  );
  renderToString(App, { width: 40 });
}

function renderText(props: Record<string, unknown>): string {
  const App = defineComponent(() => () => h(Text, props as never, { default: () => "content" }));
  return renderToString(App, { width: 40 });
}

const namedColors = [
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
] as const;

test("accepts the closed Color grammar and Text-only default escape", () => {
  for (const color of [...namedColors, "#12abEF", "#000000", "#ffffff"] as const) {
    expect(() => renderText({ color })).not.toThrow();
    expect(() => renderText({ backgroundColor: color })).not.toThrow();
    expect(() => renderBox({ borderColor: color, borderStyle: "single" })).not.toThrow();
    expect(() => renderBox({ backgroundColor: color })).not.toThrow();
  }

  expect(() => renderText({ color: "default" })).not.toThrow();
  expect(() => renderText({ backgroundColor: "default" })).not.toThrow();
  expect(() => renderBox({ backgroundColor: "default" })).toThrow(/<Box> prop "backgroundColor"/);
  expect(() => renderBox({ borderColor: "default", borderStyle: "single" })).toThrow(
    /<Box> prop "borderColor"/,
  );
});

test.each([
  "",
  "grey",
  "blackBright",
  "not-a-color",
  "revert",
  "initial",
  "#fff",
  "#12345",
  "#1234567",
  "#gggggg",
  "rgb(1, 2, 3)",
  "ansi256(42)",
])("rejects unsupported public Text color %j", (color) => {
  expect(() => renderText({ color })).toThrow(/<Text> prop "color"/);
  expect(() => renderText({ backgroundColor: color })).toThrow(/<Text> prop "backgroundColor"/);
});

test("accepts every reviewed Box enum and Text wrap value", () => {
  for (const flexDirection of ["row", "column", "row-reverse", "column-reverse"]) {
    expect(() => validateBox({ flexDirection })).not.toThrow();
  }
  for (const flexWrap of ["nowrap", "wrap", "wrap-reverse"]) {
    expect(() => validateBox({ flexWrap })).not.toThrow();
  }
  for (const alignItems of ["flex-start", "center", "flex-end", "stretch"]) {
    expect(() => validateBox({ alignItems })).not.toThrow();
  }
  for (const alignSelf of ["auto", "flex-start", "center", "flex-end", "stretch"]) {
    expect(() => validateBox({ alignSelf })).not.toThrow();
  }
  for (const justifyContent of [
    "flex-start",
    "center",
    "flex-end",
    "space-between",
    "space-around",
    "space-evenly",
  ]) {
    expect(() => validateBox({ justifyContent })).not.toThrow();
  }
  for (const position of ["relative", "absolute", "static"]) {
    expect(() =>
      validateBox({ position, top: -1, right: "25%", bottom: 2, left: "-5%" }),
    ).not.toThrow();
  }
  for (const overflow of ["visible", "hidden"]) {
    expect(() => validateBox({ overflow, overflowX: overflow, overflowY: overflow })).not.toThrow();
  }
  for (const wrap of ["wrap", "hard", "truncate", "truncate-middle", "truncate-start"]) {
    expect(() => renderText({ wrap })).not.toThrow();
  }
});

test("accepts every numeric category at its exact boundary", () => {
  for (const prop of [
    "flexBasis",
    "gap",
    "rowGap",
    "columnGap",
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "padding",
    "paddingX",
    "paddingY",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
  ]) {
    expect(() => validateBox({ [prop]: 0 })).not.toThrow();
    expect(() => validateBox({ [prop]: 65_535 })).not.toThrow();
  }
  for (const prop of [
    "top",
    "right",
    "bottom",
    "left",
    "margin",
    "marginX",
    "marginY",
    "marginTop",
    "marginRight",
    "marginBottom",
    "marginLeft",
  ]) {
    expect(() => validateBox({ [prop]: -65_535 })).not.toThrow();
    expect(() => validateBox({ [prop]: 65_535 })).not.toThrow();
  }
  for (const prop of ["flexGrow", "flexShrink"]) {
    expect(() => validateBox({ [prop]: 0 })).not.toThrow();
    expect(() => validateBox({ [prop]: 0.5 })).not.toThrow();
    expect(() => validateBox({ [prop]: 65_535 })).not.toThrow();
  }
});

test("accepts canonical percentages without losing decimals", () => {
  for (const prop of ["width", "flexBasis"]) {
    for (const value of ["0%", "0.5%", "35%", "55.9%", "100.0%"]) {
      expect(() => validateBox({ [prop]: value })).not.toThrow();
    }
  }
  for (const prop of ["top", "right", "bottom", "left"]) {
    for (const value of ["-65535%", "-0.5%", "-0%", "0%", "55.9%", "65535.000%"]) {
      expect(() => validateBox({ [prop]: value })).not.toThrow();
    }
  }
});

test.each([
  ["flexGrow", Number.NaN, RangeError],
  ["flexShrink", Number.POSITIVE_INFINITY, RangeError],
  ["flexGrow", 65_536, RangeError],
  ["flexBasis", 1.5, RangeError],
  ["flexBasis", 65_536, RangeError],
  ["gap", -1, RangeError],
  ["rowGap", 65_536, RangeError],
  ["height", "4", TypeError],
  ["height", 65_536, RangeError],
  ["maxWidth", -1, RangeError],
  ["paddingLeft", -1, RangeError],
  ["paddingLeft", 65_536, RangeError],
  ["marginTop", 0.5, RangeError],
  ["marginTop", -65_536, RangeError],
  ["top", Number.NEGATIVE_INFINITY, RangeError],
  ["top", -65_536, RangeError],
  ["left", 65_536, RangeError],
] as const)("rejects invalid numeric domain for %s", (prop, value, ErrorType) => {
  expect(() => validateBox({ [prop]: value })).toThrow(ErrorType);
});

test.each(["00%", ".5%", "1.%", "+1%", "-1%", " 1%", "1 %", "1e2%", "20"])(
  "rejects non-canonical unsigned percentage %j",
  (value) => {
    expect(() => validateBox({ width: value })).toThrow(/<Box> prop "width"/);
    expect(() => validateBox({ flexBasis: value })).toThrow(/<Box> prop "flexBasis"/);
  },
);

test.each(["--1%", "+1%", "01%", "-.5%", "1e2%", "1 %", "65535.1%", "-65535.0001%"])(
  "rejects unsafe or non-canonical offset percentage %j",
  (value) => {
    expect(() => validateBox({ right: value })).toThrow(/<Box> prop "right"/);
  },
);

test.each(["100.0001%", "100.00000000000000000001%", "101%", "65535%"])(
  "rejects percentage dimensions above the containing-block range %j",
  (value) => {
    expect(() => validateBox({ width: value })).toThrow(/<Box> prop "width"/);
    expect(() => validateBox({ flexBasis: value })).toThrow(/<Box> prop "flexBasis"/);
  },
);

test("rejects arbitrarily large percentage text before Yoga", () => {
  const huge = `${"9".repeat(400)}%`;
  expect(() => validateBox({ width: huge })).toThrow(/<Box> prop "width"/);
  expect(() => validateBox({ left: huge })).toThrow(/<Box> prop "left"/);
});

test.each([
  ["flexDirection", "diagonal"],
  ["flexWrap", "reverse"],
  ["alignItems", "baseline"],
  ["alignSelf", "baseline"],
  ["justifyContent", "stretch"],
  ["borderStyle", "double"],
  ["overflowY", "clip"],
  ["position", "fixed"],
] as const)("rejects unsupported %s value %j", (prop, value) => {
  expect(() => validateBox({ [prop]: value })).toThrow(new RegExp(`<Box> prop "${prop}"`));
});

test("validates all four border-edge booleans and six Text modifiers", () => {
  for (const prop of ["borderTop", "borderRight", "borderBottom", "borderLeft"]) {
    expect(() => validateBox({ borderStyle: "single", [prop]: true })).not.toThrow();
    expect(() => validateBox({ borderStyle: "single", [prop]: false })).not.toThrow();
    expect(() => validateBox({ borderStyle: "single", [prop]: 1 })).toThrow(TypeError);
  }
  for (const prop of ["dimColor", "bold", "italic", "underline", "strikethrough", "inverse"]) {
    expect(() => renderText({ [prop]: true })).not.toThrow();
    expect(() => renderText({ [prop]: false })).not.toThrow();
    expect(() => renderText({ [prop]: "yes" })).toThrow(TypeError);
  }
});

test("removes the truncate-end alias", () => {
  expect(() => renderText({ wrap: "truncate-end" })).toThrow(/<Text> prop "wrap"/);
});

test.each([
  ["Box", "display"],
  ["Box", "alignContent"],
  ["Box", "aspectRatio"],
  ["Box", "style"],
  ["Box", "ariaLabel"],
  ["Box", "ariaHidden"],
  ["Box", "ariaRole"],
  ["Box", "ariaState"],
  ["Box", "aria-label"],
  ["Text", "class"],
  ["Text", "style"],
  ["Text", "ariaLabel"],
  ["Text", "ariaHidden"],
] as const)("rejects omitted %s attribute %s before host creation", (component, prop) => {
  const renderRemovedProp = component === "Box" ? renderBox : renderText;
  expect(() => renderRemovedProp({ [prop]: prop.includes("Hidden") ? true : "value" })).toThrow(
    new RegExp(`<${component}> does not accept the undeclared attribute`),
  );
});

test("rejects percentage height through the declared numeric field", () => {
  expect(() => validateBox({ height: "100%" })).toThrow(TypeError);
});
