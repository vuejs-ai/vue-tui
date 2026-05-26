import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";

test("public API exposes documented members", () => {
  for (const k of [
    "createApp",
    "Box",
    "Text",
    "Newline",
    "Spacer",
    "Static",
    "Transform",
    "useExit",
    "useInput",
    "useFocus",
    "useFocusManager",
    "useStdin",
    "useStdout",
    "useStderr",
    "useTerminalSize",
    "useCursor",
  ]) {
    expect(api).toHaveProperty(k);
  }
});
