import { defineComponent, h, nextTick, reactive } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, renderToString } from "@vue-tui/runtime";
import {
  observeTuiNodeCreations,
  renderToStringWithScreenReader,
  type TuiBox,
} from "@vue-tui/runtime/internal";

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

test("screen-reader rendering skips paint-only validation", () => {
  const App = defineComponent(
    () => () =>
      h(Box, { borderStyle: "not-a-border", borderColor: "not-a-color" } as never, {
        default: () =>
          h(Text, { color: "not-a-color", backgroundColor: "not-a-color" } as never, {
            default: () => "accessible",
          }),
      }),
  );

  expect(renderToStringWithScreenReader(App)).toBe("accessible");
  expect(() => renderToString(App)).toThrow(/prop/);
});

test("screen-reader rendering still validates structure hidden from its transcript", () => {
  const InvalidBox = defineComponent(
    () => () =>
      h(Box, { ariaHidden: true, width: "not-a-percentage" } as never, {
        default: () => h(Text, null, { default: () => "hidden" }),
      }),
  );
  const InvalidText = defineComponent(
    () => () =>
      h(Text, { ariaHidden: true, wrap: "truncate-middle" } as never, { default: () => "hidden" }),
  );
  const InvalidState = defineComponent(
    () => () =>
      h(Box, { ariaHidden: true, ariaState: { busy: "yes" } } as never, {
        default: () => h(Text, null, { default: () => "hidden" }),
      }),
  );

  expect(() => renderToStringWithScreenReader(InvalidBox)).toThrow(/prop "width"/);
  expect(() => renderToStringWithScreenReader(InvalidText)).toThrow(/prop "wrap"/);
  expect(() => renderToStringWithScreenReader(InvalidState)).toThrow(/ariaState\.busy/);
});

test("reads each ariaState entry once while validating and storing a frame", () => {
  let reads = 0;
  const state = Object.defineProperty({}, "busy", {
    enumerable: true,
    get() {
      reads++;
      return reads === 1 ? true : "changed between reads";
    },
  });
  const App = defineComponent(
    () => () =>
      h(Box, { ariaState: state } as never, {
        default: () => h(Text, null, { default: () => "status" }),
      }),
  );

  expect(renderToStringWithScreenReader(App)).toBe("(busy) status");
  expect(reads).toBe(1);
});

test("a stable reactive ariaState is snapshotted per accepted frame", async () => {
  const state = reactive({ busy: false, checked: false });
  let host: TuiBox | undefined;
  const stopObserving = observeTuiNodeCreations((node) => {
    if (node.type === "tui-box" && host === undefined) host = node;
  });

  try {
    const App = defineComponent(() => () => (
      <Box ariaState={state}>
        <Text>status</Text>
      </Box>
    ));
    const result = await render(App, { host: { presentation: "screen-reader" } });
    try {
      expect(result.lastFrame()).toBe("status");
      const firstSnapshot = host?.internal_accessibility?.state;
      expect(firstSnapshot).toEqual({ busy: false, checked: false });
      expect(firstSnapshot).not.toBe(state);

      // An unaccepted in-place mutation must not mutate the previously stored host fact.
      (state as unknown as { busy: unknown }).busy = "invalid";
      expect(firstSnapshot).toEqual({ busy: false, checked: false });

      state.busy = true;
      await nextTick();
      await result.waitUntilRenderFlush();

      const secondSnapshot = host?.internal_accessibility?.state;
      expect(secondSnapshot).toEqual({ busy: true, checked: false });
      expect(secondSnapshot).not.toBe(firstSnapshot);
      expect(result.lastFrame()).toBe("(busy) status");
    } finally {
      result.dispose();
    }
  } finally {
    stopObserving();
  }
});
