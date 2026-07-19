import { defineComponent, h, shallowRef } from "vue";
import { beforeAll, describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// Full transition matrix for the "re-measure text when `wrap` changes at
// runtime" divergence (see .agents/docs/ink-divergences.md). The sibling
// `text-wrap-remeasure.test.tsx` covers the two directions of the original
// run-verified case; this file proves the GENERAL declarative invariant across
// both public wrap modes:
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

type PublicWrapMode = "wrap" | "truncate";

const PUBLIC_MODES: readonly PublicWrapMode[] = ["wrap", "truncate"];

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
    // `wrap` spans rows while `truncate` collapses to one row.
    const expected: Record<PublicWrapMode, string> = {
      wrap: "aaaa\nbbbb\ncccc\nZZZZ",
      truncate: "aaaa …\nZZZZ",
    };
    for (const mode of PUBLIC_MODES) {
      expect(freshFrames.get(mode), `fresh-mount frame for ${mode}`).toBe(expected[mode]);
    }
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

type InternalWrapMode =
  | "wrap"
  | "hard"
  | "truncate"
  | "truncate-end"
  | "truncate-middle"
  | "truncate-start";

const INTERNAL_MODES: readonly InternalWrapMode[] = [
  "wrap",
  "hard",
  "truncate",
  "truncate-end",
  "truncate-middle",
  "truncate-start",
];

function makeRawHostDynamic(wrap: { value: InternalWrapMode }) {
  // Deliberately bypass the public <Text> component, whose accepted wrap values
  // are only "wrap" and "truncate". This exercises the private renderer host
  // vocabulary that remains useful implementation material without making its
  // four extra modes part of @vue-tui/runtime's public contract.
  return defineComponent(
    () => () =>
      h("tui-box", { width: 6, flexDirection: "column" }, [
        h("tui-text", { wrap: wrap.value }, CONTENT),
        h("tui-text", null, "ZZZZ"),
      ]),
  );
}

async function freshRawHostFrame(mode: InternalWrapMode): Promise<string> {
  const wrap = shallowRef<InternalWrapMode>(mode);
  const { lastFrame } = await render(makeRawHostDynamic(wrap), { columns: 40 });
  return lastFrame() ?? "";
}

const internalTransitions: Array<[InternalWrapMode, InternalWrapMode]> = [];
for (const from of INTERNAL_MODES) {
  for (const to of INTERNAL_MODES) {
    if (from !== to) internalTransitions.push([from, to]);
  }
}

describe("private raw-host wrap transition matrix", () => {
  const freshFrames = new Map<InternalWrapMode, string>();

  beforeAll(async () => {
    for (const mode of INTERNAL_MODES) {
      freshFrames.set(mode, await freshRawHostFrame(mode));
    }
  });

  test("pins the internal six-mode fresh-mount layouts", () => {
    const expected: Record<InternalWrapMode, string> = {
      wrap: "aaaa\nbbbb\ncccc\nZZZZ",
      hard: "aaaa b\nbbb cc\ncc\nZZZZ",
      truncate: "aaaa …\nZZZZ",
      "truncate-end": "aaaa …\nZZZZ",
      "truncate-middle": "aaa…cc\nZZZZ",
      "truncate-start": "… cccc\nZZZZ",
    };
    for (const mode of INTERNAL_MODES) {
      expect(freshFrames.get(mode), `private fresh-mount frame for ${mode}`).toBe(expected[mode]);
    }
  });

  test.each(internalTransitions)(
    "reactive raw-host transition %s -> %s equals a fresh mount",
    async (from, to) => {
      const expected = freshFrames.get(to);
      expect(expected, `private ground-truth frame for ${to} not derived`).toBeDefined();

      const wrap = shallowRef<InternalWrapMode>(from);
      const { lastFrame, waitUntilRenderFlush } = await render(makeRawHostDynamic(wrap), {
        columns: 40,
      });

      wrap.value = to;
      await waitUntilRenderFlush();

      expect(lastFrame(), `${from} -> ${to} must match private fresh mount (${to})`).toBe(expected);
    },
  );
});
