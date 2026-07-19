import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";
import * as fullscreenApi from "@vue-tui/runtime/fullscreen";
import * as inlineApi from "@vue-tui/runtime/inline";
import * as internalApi from "@vue-tui/runtime/internal";

// The EXACT public runtime (value) export surface of `@vue-tui/runtime`. The test below snapshots
// it exhaustively: adding, removing, or renaming ANY value export fails — so every change to the
// public surface must be a deliberate edit here. Keep grouped + alphabetical-within-group for
// readable diffs. NOTE: type-only exports are erased at runtime and cannot be enumerated this way;
// they are guarded individually with `@ts-expect-error` (see the `ScreenReaderOptions` guard
// below). The type surface is therefore not exhaustively snapshotted.
const PUBLIC_VALUE_EXPORTS = [
  // Entry point
  "createApp",
  // Components
  "Box",
  "Text",
  // Composables
  "useApp",
  "useBoxSize",
  "useCaret",
  "useClipboard",
  "useExternalInput",
  "useFocus",
  "useFocusedInput",
  "useFocusManager",
  "useFocusScope",
  "useFocusScopeInput",
  "useInput",
  "useInputAvailability",
  "useLayoutWidth",
  "useStderr",
  "useStdin",
  "useStdout",
  "useViewportHeight",
  // Rendering
  "renderToString",
  // Kitty keyboard
  "kittyFlags",
  "kittyModifiers",
];

const FULLSCREEN_VALUE_EXPORTS = ["useMouseDrag", "useMouseEvent", "useTextSelection"];
const INLINE_VALUE_EXPORTS = ["Static"];

test("public API surface is exactly the documented value-export set", () => {
  expect(Object.keys(api).sort()).toEqual([...PUBLIC_VALUE_EXPORTS].sort());
});

test("Fullscreen API surface is exactly the Fullscreen interaction value-export set", () => {
  expect(Object.keys(fullscreenApi).sort()).toEqual(FULLSCREEN_VALUE_EXPORTS);
});

test("Inline API surface is exactly the terminal-history value-export set", () => {
  expect(Object.keys(inlineApi).sort()).toEqual(INLINE_VALUE_EXPORTS);
});

test("keeps Static on the Inline subpath without root API duplication", () => {
  expect(api).not.toHaveProperty("Static");
  expect(inlineApi).toHaveProperty("Static");
  expect(inlineApi).not.toHaveProperty("createApp");
  expect(inlineApi).not.toHaveProperty("Box");
});

test("keeps clipboard common and selectable text Fullscreen-only", () => {
  expect(api).toHaveProperty("useClipboard");
  expect(api).not.toHaveProperty("useTextSelection");
  expect(fullscreenApi).toHaveProperty("useTextSelection");
  expect(fullscreenApi).not.toHaveProperty("useClipboard");
});

test("removes the superseded root mouse APIs without compatibility shims", () => {
  expect(api).not.toHaveProperty("useMouseInput");
  expect(api).not.toHaveProperty("useDraggable");
  expect(api).not.toHaveProperty("useMouseEvent");
  expect(api).not.toHaveProperty("useMouseDrag");
});

test("does not retain the superseded render-fact hooks", () => {
  expect(api).not.toHaveProperty("useWindowSize");
  expect(api).not.toHaveProperty("useIsScreenReaderEnabled");
});

test("does not retain the superseded split input API", () => {
  expect(api).not.toHaveProperty("usePaste");
});

test("does not publish application-level rendering conveniences", () => {
  expect(api).not.toHaveProperty("Newline");
  expect(api).not.toHaveProperty("Spacer");
  expect(api).not.toHaveProperty("Transform");
  expect(api).not.toHaveProperty("useAnimation");
});

test("replaces broad geometry with accepted Box size", () => {
  expect(api).toHaveProperty("useBoxSize");
  expect(api).not.toHaveProperty("useElementGeometry");
  expect(api).not.toHaveProperty("useBoxMetrics");
  expect(api).not.toHaveProperty("measureElement");
});

test("publishes narrow layout facts without the internal session graph", () => {
  expect(api).toHaveProperty("useLayoutWidth");
  expect(api).toHaveProperty("useViewportHeight");
  expect(api).not.toHaveProperty("useLayoutSize");
  expect(api).not.toHaveProperty("useRenderSession");
});

test("replaces targetless cursor ownership with focus-bound caret composition", () => {
  expect(api).toHaveProperty("useCaret");
  expect(api).not.toHaveProperty("useCursor");
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

// The parallel guard for the public `renderToString`'s dropped `isScreenReaderEnabled` OPTION lives
// in render-to-string.test.tsx (a call-site `@ts-expect-error`), next to the renderToString tests.
