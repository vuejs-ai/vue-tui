import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, renderToString } from "@vue-tui/runtime";

function renderBox(props: Record<string, unknown>): string {
  const App = defineComponent(
    () => () =>
      h(Box, props as never, { default: () => h(Text, null, { default: () => "content" }) }),
  );
  return renderToString(App, { columns: 40 });
}

function renderText(props: Record<string, unknown>): string {
  const App = defineComponent(() => () => h(Text, props as never, { default: () => "content" }));
  return renderToString(App, { columns: 40 });
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

test("accepts exactly the public terminal color families", () => {
  for (const color of [...namedColors, "#12abEF", "#000000", "#ffffff"] as const) {
    expect(() => renderText({ color })).not.toThrow();
    expect(() => renderText({ backgroundColor: color })).not.toThrow();
    expect(() => renderBox({ borderColor: color, borderStyle: "single" })).not.toThrow();
    expect(() => renderBox({ backgroundColor: color })).not.toThrow();
  }

  expect(() => renderText({ color: "revert" })).not.toThrow();
  expect(() => renderText({ color: "initial" })).not.toThrow();
});

test.each([
  "",
  "grey",
  "blackBright",
  "not-a-color",
  "#fff",
  "#12345",
  "#1234567",
  "#gggggg",
  "rgb(1, 2, 3)",
  "ansi256(42)",
])("rejects unsupported public foreground color %j", (color) => {
  expect(() => renderText({ color })).toThrow(/<Text> prop "color"/);
});

test("foreground reset tokens are not background or border colors", () => {
  expect(() => renderText({ backgroundColor: "revert" })).toThrow(/<Text> prop "backgroundColor"/);
  expect(() => renderBox({ backgroundColor: "initial" })).toThrow(/<Box> prop "backgroundColor"/);
  expect(() => renderBox({ borderColor: "revert", borderStyle: "single" })).toThrow(
    /<Box> prop "borderColor"/,
  );
});

test("accepts the retained numeric domains at their exact boundaries", () => {
  expect(() =>
    renderBox({
      flexDirection: "column",
      flexGrow: 65_535,
      flexShrink: 0,
      flexBasis: 65_535,
      alignItems: "center",
      justifyContent: "space-between",
      gap: 65_535,
      width: 65_535,
      height: 65_535,
      minWidth: 65_535,
      minHeight: 65_535,
      position: "absolute",
      top: -65_535,
      left: 65_535,
      marginTop: -65_535,
      paddingTop: 65_535,
      paddingBottom: 65_535,
      paddingLeft: 65_535,
      paddingRight: 65_535,
      overflowY: "hidden",
      // Yoga removes a display:none node from layout, so this assertion tests
      // validation boundaries without asking the painter to allocate the
      // deliberately separate maximum for every dimension at once.
      display: "none",
    }),
  ).not.toThrow();

  expect(() => renderBox({ width: "0%" })).not.toThrow();
  expect(() => renderBox({ width: "100.000%" })).not.toThrow();
  expect(() => renderBox({ display: "none", marginTop: 65_535 })).not.toThrow();
});

test.each([
  ["flexGrow", Number.NaN, RangeError],
  ["flexShrink", Number.POSITIVE_INFINITY, RangeError],
  ["flexGrow", 65_536, RangeError],
  ["flexBasis", 1.5, RangeError],
  ["flexBasis", 65_536, RangeError],
  ["gap", -1, RangeError],
  ["gap", 65_536, RangeError],
  ["height", "4", TypeError],
  ["height", 65_536, RangeError],
  ["minWidth", 65_536, RangeError],
  ["paddingLeft", -1, RangeError],
  ["paddingLeft", 65_536, RangeError],
  ["marginTop", 0.5, RangeError],
  ["marginTop", -65_536, RangeError],
  ["top", Number.NEGATIVE_INFINITY, RangeError],
  ["top", -65_536, RangeError],
  ["left", 65_536, RangeError],
] as const)("rejects invalid numeric domain for %s", (prop, value, ErrorType) => {
  expect(() => renderBox({ [prop]: value })).toThrow(ErrorType);
});

test.each(["00%", ".5%", "1.%", "+1%", "-1%", " 1%", "1 %", "1e2%", "20"])(
  "rejects non-canonical percentage width %j",
  (width) => {
    expect(() => renderBox({ width })).toThrow(/<Box> prop "width"/);
  },
);

test("rejects an arbitrarily large decimal percentage", () => {
  expect(() => renderBox({ width: `${"9".repeat(400)}%` })).toThrow(/<Box> prop "width"/);
});

test.each(["100.0001%", "100.00000000000000000001%", "101%", "65535%"])(
  "rejects percentage width above the evidenced containing-block range %j",
  (width) => {
    expect(() => renderBox({ width })).toThrow(/<Box> prop "width"/);
  },
);

test.each([
  ["flexDirection", "row-reverse"],
  ["alignItems", "flex-start"],
  ["justifyContent", "space-around"],
  ["borderStyle", "double"],
  ["overflowY", "clip"],
  ["display", "block"],
  ["position", "relative"],
] as const)("rejects unsupported %s value %j", (prop, value) => {
  expect(() => renderBox({ [prop]: value })).toThrow(new RegExp(`<Box> prop "${prop}"`));
});

test("requires every public offset to belong to an absolute Box", () => {
  expect(() => renderBox({ top: 0 })).toThrow(/require position="absolute"/);
  expect(() => renderBox({ left: -1 })).toThrow(/require position="absolute"/);
  expect(() => renderBox({ position: "absolute", top: 0, left: -1 })).not.toThrow();
});

test.each(["hard", "truncate-end", "truncate-middle", "truncate-start"])(
  "rejects removed Text wrap mode %j",
  (wrap) => {
    expect(() => renderText({ wrap })).toThrow(/<Text> prop "wrap"/);
  },
);

test.each([
  ["Box", "ariaLabel"],
  ["Box", "ariaHidden"],
  ["Box", "ariaRole"],
  ["Box", "ariaState"],
  ["Box", "aria-label"],
  ["Box", "aria-hidden"],
  ["Box", "aria-role"],
  ["Box", "aria-state"],
  ["Text", "ariaLabel"],
  ["Text", "ariaHidden"],
  ["Text", "aria-label"],
  ["Text", "aria-hidden"],
] as const)("rejects removed %s attribute %s at runtime", (component, prop) => {
  const renderRemovedProp = component === "Box" ? renderBox : renderText;
  expect(() => renderRemovedProp({ [prop]: prop.endsWith("Hidden") ? true : "value" })).toThrow(
    new RegExp(`<${component}> does not accept the undeclared attribute`),
  );
});
