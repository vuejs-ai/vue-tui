import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";

test("public API exposes documented members", () => {
  for (const k of [
    // Entry point
    "createApp",
    // Components
    "Box",
    "Text",
    "Newline",
    "Spacer",
    "Static",
    "Transform",
    // Composables
    "useExit",
    "useInput",
    "useFocus",
    "useFocusManager",
    "useStdin",
    "useStdout",
    "useStderr",
    "useTerminalSize",
    "useWindowSize",
    "useCursor",
    "useIsScreenReaderEnabled",
    "useAnimation",
    "useBoxMetrics",
    "measureElement",
    "usePaste",
    // Rendering
    "renderToString",
    "renderScreenReaderOutput",
    // Kitty keyboard
    "kittyFlags",
    "kittyModifiers",
  ]) {
    expect(api).toHaveProperty(k);
  }
});

test("useWindowSize is an alias for useTerminalSize", () => {
  expect(api.useWindowSize).toBe(api.useTerminalSize);
});

// Ink keeps its `measure-text` module internal and does not re-export it. vue-tui
// once exported `measureText`/`measureTextNatural` under the (incorrect) belief it
// "matched Ink's public API" — it does not. These stay internal; this guards the
// alignment against re-introduction. See .agents/docs/ink-divergences.md.
test("does not expose internal text-measurement helpers (Ink keeps them internal)", () => {
  expect(api).not.toHaveProperty("measureText");
  expect(api).not.toHaveProperty("measureTextNatural");
});
