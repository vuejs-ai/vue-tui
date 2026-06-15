import { defineComponent, shallowRef } from "vue";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Full transition matrix for the "re-measure text when `wrap` changes at
// runtime" divergence (see .agents/docs/ink-divergences.md). The sibling
// `text-wrap-remeasure.test.tsx` covers the two directions of the original
// run-verified case; this file proves the GENERAL declarative invariant across
// every wrap mode:
//
//   changing `wrap` at runtime produces the EXACT SAME frame as mounting with
//   that `wrap` from the start  (i.e. measure always equals paint).
//
// `wrap` is the one STYLE_PROP that changes a text node's MEASURED height yet is
// not a yoga prop, so a wrap-only change must re-mark the text dirty or yoga
// keeps the stale height while paint uses the new mode → layout/paint disagree.
// The fresh-mount frames are the GROUND TRUTH: we derive them at runtime (mount
// once per mode) rather than hardcoding, so the matrix is robust to harmless
// rendering tweaks and a failure means a real measure/paint disagreement.

// Box width 6, column layout. "aaaa bbbb cccc" is 14 cols, so the modes produce
// different measured heights (wrap/hard → multiple rows; the truncate variants →
// 1 row), which is exactly what a runtime change must re-measure.
const CONTENT = "aaaa bbbb cccc";

type WrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

const MODES: readonly WrapMode[] = [
  "wrap",
  "hard",
  "truncate",
  "truncate-end",
  "truncate-middle",
  "truncate-start",
];

function makeDynamic(wrap: { value: WrapMode }) {
  // A reactive <Text :wrap> over fixed content, with a sentinel <Text> below so
  // a stale measured height strands/overwrites the sentinel (the bug's symptom).
  return defineComponent(() => () => (
    <Box width={6} flexDirection="column">
      <Text wrap={wrap.value}>{CONTENT}</Text>
      <Text>ZZZZ</Text>
    </Box>
  ));
}

// Mount fresh with `mode` and return the settled frame. This is the ground truth
// each toggled frame is compared against.
async function freshMountFrame(mode: WrapMode): Promise<string> {
  const wrap = shallowRef<WrapMode>(mode);
  const { lastFrame } = await render(makeDynamic(wrap), { columns: 40 });
  return lastFrame() ?? "";
}

// 30 ordered (from, to) pairs with from ≠ to.
const transitions: Array<[WrapMode, WrapMode]> = [];
for (const from of MODES) {
  for (const to of MODES) {
    if (from !== to) transitions.push([from, to]);
  }
}

describe("wrap-mode transition matrix: a runtime `wrap` change === a fresh mount with that wrap", () => {
  // Ground-truth fresh-mount frame per mode. Derived in beforeAll (runs before
  // every test in this suite regardless of ordering) so the matrix never depends
  // on a sibling test having run first.
  const freshFrames = new Map<WrapMode, string>();

  beforeAll(async () => {
    for (const mode of MODES) {
      freshFrames.set(mode, await freshMountFrame(mode));
    }
  });

  test("derived ground-truth fresh-mount frames match explicit expectations", () => {
    // Pin every mode's ground truth, so the matrix below compares toggled frames
    // against the layouts we actually expect (not a silently-wrong baseline).
    // `wrap`/`hard` wrap across rows; the four truncate modes collapse to one
    // row (`truncate` and `truncate-end` are identical — both ellipsis-at-end).
    const expected: Record<WrapMode, string> = {
      wrap: "aaaa\nbbbb\ncccc\nZZZZ",
      hard: "aaaa b\nbbb cc\ncc\nZZZZ",
      truncate: "aaaa …\nZZZZ",
      "truncate-end": "aaaa …\nZZZZ",
      "truncate-middle": "aaa…cc\nZZZZ",
      "truncate-start": "… cccc\nZZZZ",
    };
    for (const mode of MODES) {
      expect(freshFrames.get(mode), `fresh-mount frame for ${mode}`).toBe(expected[mode]);
    }
  });

  // Each transition: mount with `from`, toggle the reactive ref to `to`, flush,
  // and assert the toggled frame equals the fresh-mount frame for `to`.
  test.each(transitions)(
    "toggle %s -> %s equals a fresh mount with the target wrap",
    async (from, to) => {
      const expected = freshFrames.get(to);
      expect(expected, `ground-truth frame for ${to} not derived`).toBeDefined();

      const wrap = shallowRef<WrapMode>(from);
      const { lastFrame, waitUntilRenderFlush } = await render(makeDynamic(wrap), {
        columns: 40,
      });

      wrap.value = to;
      // Deterministic flush (forces the scheduler's pending/throttled commit)
      // rather than racing the ~32ms commit throttle with bare nextTick.
      await waitUntilRenderFlush();

      expect(lastFrame(), `${from} -> ${to} must match fresh-mount(${to})`).toBe(expected);
    },
  );
});
