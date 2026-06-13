import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";
import * as internalApi from "@vue-tui/runtime/internal";

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

// `renderScreenReaderOutput` is the screen-reader linearizer — internal SR machinery,
// not a public API. Ink keeps its counterpart (`renderNodeToScreenReaderOutput`)
// module-internal and never re-exports it; we match that. It was never usefully
// callable from the public barrel anyway: its only parameter type (`TuiNode`) and the
// node-construction primitives needed to build one live only in
// `@vue-tui/runtime/internal`. It moves there. See .agents/docs/accessibility-api.md.
test("does not expose the screen-reader linearizer publicly (Ink keeps it internal)", () => {
  expect(api).not.toHaveProperty("renderScreenReaderOutput");
  expect(internalApi).toHaveProperty("renderScreenReaderOutput");
});

// Compile-time guard for the TYPE half of the contract (types are erased at runtime, so this
// can't be an `expect()`): `ScreenReaderOptions` is internal-only too. Importing it from the
// PUBLIC barrel must NOT type-check — if it is ever re-added there, this `@ts-expect-error` goes
// unused and `tsc --noEmit` fails. Same idiom as the prop-type fixtures in integration/pty/fixtures.
// It DOES type-check from `/internal`, which the runtime guard above already proves is the home.
// @ts-expect-error - ScreenReaderOptions is exported only from @vue-tui/runtime/internal
export type _ScreenReaderOptionsIsInternalOnly = import("@vue-tui/runtime").ScreenReaderOptions;
