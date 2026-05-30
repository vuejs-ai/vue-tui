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
    "useAppContext",
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
    "measureText",
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
