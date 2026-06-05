import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import stripAnsi from "strip-ansi";
import { createApp, Text } from "@vue-tui/runtime";
import {
  captureWrites,
  getContentWrites,
  makeFakeStdin,
  makeFakeWritable,
} from "./test-streams.ts";

// The throwing components are defined INLINE in this test file (not a separate
// fixture module) on purpose: @vitejs/plugin-vue-jsx injects an SSR
// register-helper around every defineComponent in a non-test .tsx module, and
// that helper throws in the test runner before our intended error fires.
// Defining them here also means the thrown error's stack origin points at THIS
// file — which exists on disk — so ErrorOverview's fs.existsSync guard passes
// and the code-excerpt is read back and rendered.
//
// The throw below is on a known line; the excerpt test asserts that the source
// of the throw line ('throw new Error("Boom from fixture")') is highlighted.
const ThrowingComponent = defineComponent(() => {
  return () => {
    throw new Error("Boom from fixture");
  };
});

// Nested-throw parent, mirroring Ink's errors.tsx:88-121.
const NestedThrower = defineComponent(() => {
  return () => {
    throw new Error("Nested component error");
  };
});
const ParentWithNestedThrow = defineComponent(() => {
  return () => h(Text, null, ["Before error", h(NestedThrower)]);
});

// Finding 2: a primitive (non-Error) throw. Vue's onErrorCaptured receives the
// raw value; Ink stores the raw thrown value and ErrorOverview renders the
// stack block only when error.stack exists. A string has no .stack, so the
// frame must show " ERROR  <value>" and NO synthetic stack.
const PrimitiveThrower = defineComponent(() => {
  return () => {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- deliberately throwing a primitive to exercise the non-Error display path (Ink parity)
    throw "primitive thrown";
  };
});

// Finding 1: a thrown Error whose stack contains a frame StackUtils cannot
// parse. We overwrite .stack with the message line plus a single unparsable
// frame so ErrorOverview hits its `!parsedLine` fallback branch.
const UnparsableStackThrower = defineComponent(() => {
  return () => {
    const e = new Error("Unparsable stack boom");
    const firstLine = (e.stack ?? "").split("\n")[0] ?? "Error: Unparsable stack boom";
    e.stack = `${firstLine}\n    <<<unparsable frame>>>`;
    throw e;
  };
});

// Mirrors Ink's test/errors.tsx: mount a throwing component, then inspect the
// LAST content write to stdout — that is the ErrorOverview frame the boundary
// renders before exit(). We mount directly (not via @vue-tui/testing's render(),
// which re-throws the captured error and would discard the frame) so we can read
// the frame the error boundary painted.
async function renderErrorFrame(component: Parameters<typeof createApp>[0]): Promise<string> {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const app = createApp(component);
  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });

  // The exit promise rejects (component threw); swallow it. Then wait for the
  // boundary's onErrorCaptured → nextTick → ErrorOverview commit → exit chain.
  app.waitUntilExit().catch(() => {});
  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));

  const content = getContentWrites(writes);
  const lastContentWrite = content.at(-1);
  if (lastContentWrite === undefined) {
    throw new Error("no content write captured");
  }
  return stripAnsi(lastContentWrite);
}

test("renders a full ERROR overview frame with label, origin, excerpt, and stack", async () => {
  const frame = await renderErrorFrame(ThrowingComponent);

  // White-on-red " ERROR " label followed by the message. Ink renders
  // "  ERROR  Oh no" — a space inside the label on each side, plus a leading
  // space on the message — so " ERROR  <message>" appears after stripping ANSI.
  expect(frame).toContain(" ERROR  Boom from fixture");

  // Parsed file:line:column origin line (dimColor). The throw is in this file.
  expect(frame).toMatch(/error-overview\.test\.tsx:\d+:\d+/);

  // Code excerpt: the throwing line is read back from disk and highlighted.
  // Assert the source text of the throw appears with a padded line-number gutter.
  expect(frame).toMatch(/\d+:\s+throw new Error\("Boom from fixture"\);/);

  // Stack trace line: "- <fn> (<file>:<line>:<col>)" with a cwd-relative path.
  expect(frame).toMatch(/- .*\(.*error-overview\.test\.tsx:\d+:\d+\)/);
});

test("nested component throw renders a frame containing ERROR and the message", async () => {
  const frame = await renderErrorFrame(ParentWithNestedThrow);

  // Case-sensitive ERROR substring (mirrors errors.tsx:88-121).
  expect(frame).toContain("ERROR");
  expect(frame).toContain("Nested component error");
});

test("unparsable stack frame falls back to literal backslash-t (not a real TAB)", async () => {
  const frame = await renderErrorFrame(UnparsableStackThrower);

  expect(frame).toContain(" ERROR  Unparsable stack boom");

  // Ink's JSX `{line}\t{' '}` emits the unparsed line followed by TWO LITERAL
  // chars (backslash + t) and a space — `\t` in JSXText is not an escape.
  // Match byte-for-byte: backslash, t, space after the raw frame text.
  expect(frame).toContain("<<<unparsable frame>>>\\t ");

  // And it must NOT contain a real TAB (0x09) on the fallback line.
  const fallbackLine = frame.split("\n").find((l) => l.includes("<<<unparsable frame>>>"));
  expect(fallbackLine).toBeDefined();
  expect(fallbackLine).not.toContain("\t");
});

test("primitive (non-Error) throw renders ERROR header with no synthetic stack", async () => {
  const frame = await renderErrorFrame(PrimitiveThrower);

  // vue-tui renders String(value) as the message for a primitive throw, so the header
  // shows the thrown text. (Ink renders {error.message}, blank for a primitive that has no
  // .message — see .agents/docs/ink-divergences.md, section "Non-Error thrown values keep
  // their message in the error overview".)
  expect(frame).toContain(" ERROR  primitive thrown");

  // A primitive has no .stack, so Ink renders no origin/excerpt/stack block.
  // The synthetic-stack regression would surface as dist/index.mjs or Vue
  // runtime frames and "- " stack-frame lines — assert none appear.
  expect(frame).not.toContain("dist/index.mjs");
  expect(frame).not.toContain("dist/");
  expect(frame).not.toMatch(/^\s*- /m);
});
