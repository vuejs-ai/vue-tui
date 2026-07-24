import { defineComponent, shallowRef } from "vue";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Full transition matrix for the "re-measure text when `wrap` changes at
// runtime" divergence (see .agents/docs/ink-divergences.md). The sibling
// `text-wrap-remeasure.test.tsx` covers the two directions of the original
// run-verified case; this file proves the GENERAL declarative invariant across
// all five public wrap modes:
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

// Box width 6, column layout. "aaaa bbbb cccc" is 14 cols, so wrapping produces
// multiple rows while truncation produces one. That difference is what a runtime
// change must re-measure.
const CONTENT = "aaaa bbbb cccc";

type PublicWrapMode = "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start";

const PUBLIC_MODES: readonly PublicWrapMode[] = [
  "wrap",
  "hard",
  "truncate",
  "truncate-middle",
  "truncate-start",
];

function makePublicDynamic(wrap: { value: PublicWrapMode }) {
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
async function freshPublicFrame(mode: PublicWrapMode): Promise<string> {
  const wrap = shallowRef<PublicWrapMode>(mode);
  const { lastFrame } = await render(makePublicDynamic(wrap), { columns: 40 });
  return lastFrame() ?? "";
}

// Both ordered transitions.
const publicTransitions: Array<[PublicWrapMode, PublicWrapMode]> = [];
for (const from of PUBLIC_MODES) {
  for (const to of PUBLIC_MODES) {
    if (from !== to) publicTransitions.push([from, to]);
  }
}

describe("wrap-mode transition matrix: a runtime `wrap` change === a fresh mount with that wrap", () => {
  // Ground-truth fresh-mount frame per mode. Derived in beforeAll (runs before
  // every test in this suite regardless of ordering) so the matrix never depends
  // on a sibling test having run first.
  const freshFrames = new Map<PublicWrapMode, string>();

  beforeAll(async () => {
    for (const mode of PUBLIC_MODES) {
      freshFrames.set(mode, await freshPublicFrame(mode));
    }
  });

  test("derived ground-truth fresh-mount frames match explicit expectations", () => {
    // Pin every mode's ground truth, so the matrix below compares toggled frames
    // against the layouts we actually expect (not a silently-wrong baseline).
    // `wrap` and `hard` span rows; all truncation modes preserve one row.
    const expected: Record<PublicWrapMode, string> = {
      wrap: "aaaa\nbbbb\ncccc\nZZZZ",
      hard: "aaaa b\nbbb cc\ncc\nZZZZ",
      truncate: "aaaa …\nZZZZ",
      "truncate-middle": "aaa…cc\nZZZZ",
      "truncate-start": "… cccc\nZZZZ",
    };
    for (const mode of PUBLIC_MODES) {
      expect(freshFrames.get(mode), `fresh-mount frame for ${mode}`).toBe(expected[mode]);
    }
  });

  test("removing the wrap key re-measures and restores default wrapping", async () => {
    const explicit = shallowRef(true);
    const App = defineComponent(() => () => (
      <Box width={6} flexDirection="column">
        <Text {...(explicit.value ? { wrap: "truncate" as const } : {})}>{CONTENT}</Text>
        <Text>ZZZZ</Text>
      </Box>
    ));
    const { lastFrame, waitUntilRenderFlush } = await render(App, { columns: 40 });

    expect(lastFrame()).toBe("aaaa …\nZZZZ");

    // The next VNode omits wrap rather than retaining wrap={undefined}; Vue
    // sends null for the removed host key and Text must return to default wrap.
    explicit.value = false;
    await waitUntilRenderFlush();

    expect(lastFrame()).toBe("aaaa\nbbbb\ncccc\nZZZZ");
  });

  // Each transition: mount with `from`, toggle the reactive ref to `to`, flush,
  // and assert the toggled frame equals the fresh-mount frame for `to`.
  test.each(publicTransitions)(
    "toggle %s -> %s equals a fresh mount with the target wrap",
    async (from, to) => {
      const expected = freshFrames.get(to);
      expect(expected, `ground-truth frame for ${to} not derived`).toBeDefined();

      const wrap = shallowRef<PublicWrapMode>(from);
      const { lastFrame, waitUntilRenderFlush } = await render(makePublicDynamic(wrap), {
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
