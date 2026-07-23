import { expect, test } from "vite-plus/test";
import * as api from "@vue-tui/runtime";
import * as devtoolsApi from "@vue-tui/runtime/devtools";
import * as inlineApi from "@vue-tui/runtime/inline";
import * as testingApi from "@vue-tui/runtime/testing";
import * as internalApi from "../../runtime/dist/internal.mjs";

// The EXACT public runtime (value) export surface of `@vue-tui/runtime`. The test below snapshots
// it exhaustively: adding, removing, or renaming ANY value export fails — so every change to the
// public surface must be a deliberate edit here. Keep grouped + alphabetical-within-group for
// readable diffs. NOTE: type-only exports are erased at runtime and cannot be enumerated this way;
// they are guarded individually with `@ts-expect-error`. The type surface is therefore not
// exhaustively snapshotted.
const PUBLIC_VALUE_EXPORTS = [
  // Entry point
  "createApp",
  // Components
  "Box",
  "Text",
  // Composables
  "useApp",
  "useBoxSize",
  "useFocus",
  "useInput",
  "useLayoutWidth",
  "useStdin",
  "useViewportHeight",
  // Rendering
  "renderToString",
];

const INLINE_VALUE_EXPORTS = ["Static"];
const DEVTOOLS_VALUE_EXPORTS = ["connectDevtools"];
const TESTING_VALUE_EXPORTS = ["createTestHostBridge"];

test("public API surface is exactly the documented value-export set", () => {
  expect(Object.keys(api).sort()).toEqual([...PUBLIC_VALUE_EXPORTS].sort());
});

test("Inline API surface is exactly the terminal-history value-export set", () => {
  expect(Object.keys(inlineApi).sort()).toEqual(INLINE_VALUE_EXPORTS);
});

test("supported infrastructure subpaths stay narrow", () => {
  expect(Object.keys(devtoolsApi).sort()).toEqual(DEVTOOLS_VALUE_EXPORTS);
  expect(Object.keys(testingApi).sort()).toEqual(TESTING_VALUE_EXPORTS);
});

test("keeps Static on the Inline subpath without root API duplication", () => {
  expect(api).not.toHaveProperty("Static");
  expect(inlineApi).toHaveProperty("Static");
  expect(inlineApi).not.toHaveProperty("createApp");
  expect(inlineApi).not.toHaveProperty("Box");
});

test("keeps pointer, selection, and clipboard policy outside the Runtime foundation", () => {
  expect(api).not.toHaveProperty("useClipboard");
  expect(api).not.toHaveProperty("useTextSelection");
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

test("keeps focus identity and normalized subscription without publishing routing policy", () => {
  expect(api).toHaveProperty("useInput");
  expect(api).toHaveProperty("useFocus");
  expect(api).not.toHaveProperty("useBoxPresence");
  expect(api).not.toHaveProperty("useInputAvailability");
  expect(api).not.toHaveProperty("useExternalInput");
  expect(api).not.toHaveProperty("useFocusedInput");
  expect(api).not.toHaveProperty("useFocusManager");
  expect(api).not.toHaveProperty("useFocusScope");
  expect(api).not.toHaveProperty("useFocusScopeInput");
});

test("keeps Kitty protocol controls private", () => {
  expect(api).not.toHaveProperty("kittyFlags");
  expect(api).not.toHaveProperty("kittyModifiers");
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

test("keeps physical caret placement outside the minimum foundation", () => {
  expect(api).not.toHaveProperty("useCaret");
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

test("does not expose removed screen-reader machinery publicly or internally", () => {
  expect(api).not.toHaveProperty("renderScreenReaderOutput");
  expect(internalApi).not.toHaveProperty("renderScreenReaderOutput");
  expect(internalApi).not.toHaveProperty("renderToStringWithScreenReader");
});

// @ts-expect-error ScreenReaderOptions is absent from the public root.
export type _PublicScreenReaderOptionsWasRemoved = import("@vue-tui/runtime").ScreenReaderOptions;
export type _InternalScreenReaderOptionsWasRemoved =
  // @ts-expect-error ScreenReaderOptions is absent from the repository-only internal barrel too.
  import("../../runtime/dist/internal.mjs").ScreenReaderOptions;

// The parallel guard for the public `renderToString`'s dropped `isScreenReaderEnabled` OPTION lives
// in render-to-string.test.tsx (a call-site `@ts-expect-error`), next to the renderToString tests.
