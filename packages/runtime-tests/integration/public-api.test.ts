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
    "useApp",
    "useInput",
    "useFocus",
    "useFocusManager",
    "useStdin",
    "useStdout",
    "useStderr",
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

// Ink keeps its `measure-text` module internal and does not re-export it. vue-tui
// once exported `measureText`/`measureTextNatural` under the (incorrect) belief it
// "matched Ink's public API" — it does not. These stay internal; this guards the
// alignment against re-introduction. See .agents/docs/ink-divergences.md.
test("does not expose internal text-measurement helpers (Ink keeps them internal)", () => {
  expect(api).not.toHaveProperty("measureText");
  expect(api).not.toHaveProperty("measureTextNatural");
});
