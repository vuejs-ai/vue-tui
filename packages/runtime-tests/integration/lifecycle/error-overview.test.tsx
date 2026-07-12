import { cwd } from "node:process";
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
  app.mount({ stdout, stdin, stderr, maxFps: 0 });

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

// Capture BOTH the painted ERROR overview frame AND what waitUntilExit() rejects
// with, from a SINGLE mount of the same throwing component. This is what proves
// display/reject CONSISTENCY: the message shown to the user and the message on
// the rejected Error must be the same string (audit finding e17).
async function renderFrameAndReject(component: Parameters<typeof createApp>[0]): Promise<{
  frame: string;
  reject: { kind: "rejected"; message: unknown; isError: boolean } | { kind: "resolved" };
}> {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  const app = createApp(component);
  app.mount({ stdout, stdin, stderr, maxFps: 0 });

  let reject: { kind: "rejected"; message: unknown; isError: boolean } | { kind: "resolved" } = {
    kind: "resolved",
  };
  const settled = app.waitUntilExit().then(
    () => {
      reject = { kind: "resolved" };
    },
    (e: unknown) => {
      reject = { kind: "rejected", message: (e as Error)?.message, isError: e instanceof Error };
    },
  );

  await new Promise<void>((r) => setImmediate(r));
  await new Promise<void>((r) => setImmediate(r));
  await settled;

  const content = getContentWrites(writes);
  const lastContentWrite = content.at(-1);
  if (lastContentWrite === undefined) {
    throw new Error("no content write captured");
  }
  return { frame: stripAnsi(lastContentWrite), reject };
}

// Pull the message that follows the white-on-red " ERROR " label out of the
// painted frame (the text the user actually sees as the error message).
function overviewMessage(frame: string): string {
  const header = frame.split("\n").find((l) => l.includes("ERROR"));
  if (header === undefined) throw new Error("no ERROR header line in frame");
  // Label renders as "  ERROR " (space-padded) then " <message>" (a leading
  // space before the message). Strip the label + all surrounding whitespace to
  // recover the pure message text.
  return header.replace(/^\s*ERROR\s*/, "").trimEnd();
}

// --- Display/reject consistency (audit finding e17) ---
// vue-tui's blessed contract: ANY thrown value renders an ErrorOverview AND
// rejects waitUntilExit() with an Error whose .message EQUALS the displayed
// message. Before the fix, `throw {message:'objmsg'}` DISPLAYED "objmsg" but
// REJECTED with "[object Object]" (the wrap site used new Error(String(err))).

test("non-Error throw: overview message and rejected Error message are identical (object with string message)", async () => {
  const Thrower = defineComponent(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising a non-Error throw with a string .message (e17)
      throw { message: "objmsg" };
    };
  });

  const { frame, reject } = await renderFrameAndReject(Thrower);

  // Display: the overview surfaces the string .message.
  expect(frame).toContain(" ERROR  objmsg");
  // Reject: the SAME message, not "[object Object]".
  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  expect(reject.isError).toBe(true);
  expect(reject.message).toBe("objmsg");
  // Consistency: display === reject.
  expect(reject.message).toBe(overviewMessage(frame));
});

test("non-Error throw: overview message and rejected Error message are identical (number)", async () => {
  const Thrower = defineComponent(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising a primitive non-Error throw (e17)
      throw 42;
    };
  });

  const { frame, reject } = await renderFrameAndReject(Thrower);

  expect(frame).toContain(" ERROR  42");
  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  expect(reject.message).toBe("42");
  expect(reject.message).toBe(overviewMessage(frame));
});

test("non-Error throw: '[unserializable value]' is shown AND rejected with, and they agree", async () => {
  // A pathological thrown value whose `.message` is a non-string AND whose
  // primitive coercion throws: messageForNonError selects the String(value)
  // branch, String(value) throws (Symbol.toPrimitive), and safeString() falls
  // back to the fixed "[unserializable value]" placeholder. The SAME helper feeds
  // the overview header and render.ts's reject-wrap, so the displayed and rejected
  // messages must BOTH be "[unserializable value]" — they cannot drift (e17).
  const Thrower = defineComponent(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- non-Error value whose primitive coercion throws, exercising the unserializable placeholder (e17)
      throw {
        get message(): number {
          return 42;
        },
        [Symbol.toPrimitive](): never {
          throw new Error("toPrimitive boom");
        },
      };
    };
  });

  const { frame, reject } = await renderFrameAndReject(Thrower);

  // Display: the overview surfaces the placeholder.
  expect(frame).toContain(" ERROR  [unserializable value]");
  // Reject: the SAME placeholder string on a real Error.
  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  expect(reject.isError).toBe(true);
  expect(reject.message).toBe("[unserializable value]");
  // Consistency: display === reject.
  expect(reject.message).toBe(overviewMessage(frame));
});

test("non-Error throw: non-string .message falls back to String on BOTH paths and they agree", async () => {
  const Thrower = defineComponent(() => {
    return () => {
      // A NON-string .message: the overview's `typeof message === 'string'` guard
      // fails, so both paths fall back to String(value). They must still AGREE.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising a non-Error throw with a non-string .message (e17)
      throw { message: 42 };
    };
  });

  const { frame, reject } = await renderFrameAndReject(Thrower);

  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  // Both fall back to String({message:42}) === "[object Object]".
  expect(reject.message).toBe("[object Object]");
  expect(reject.message).toBe(overviewMessage(frame));
});

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

test("cross-realm Error overview header renders message without Error prefix", async () => {
  const vm = await import("node:vm");
  const foreignError = vm.runInNewContext("new Error('boom')") as Error;
  const CrossRealmThrower = defineComponent(() => {
    return () => {
      throw foreignError;
    };
  });

  const frame = await renderErrorFrame(CrossRealmThrower);

  expect(frame).toContain(" ERROR  boom");
  expect(frame).not.toContain(" ERROR  Error: boom");
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

test("throwing .stack getter renders ERROR header with no synthetic stack (hardened read)", async () => {
  // A pathological thrown value with a THROWING `.stack` getter. ErrorOverview
  // reads `.stack` during render; an unguarded read would throw, Vue would catch
  // it and re-route a NEW Error (with a real `.stack` pointing into Vue/dist
  // internals), and the boundary would re-render an overview that LEAKS those
  // internal frames — the same synthetic-stack corruption the primitive test
  // guards against. With the guarded single `.stack` read, the throw is swallowed
  // and the overview renders header-only (the primitive-throw path).
  const StackGetterThrower = defineComponent(() => {
    return () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- non-Error value with a throwing .stack getter, exercising the hardened read
      throw {
        message: "stack getter boom",
        get stack(): string {
          throw new Error("inner stack boom");
        },
      };
    };
  });

  const frame = await renderErrorFrame(StackGetterThrower);

  // The header shows the string .message (read via messageForNonError).
  expect(frame).toContain(" ERROR  stack getter boom");

  // No synthetic stack leaked: the unguarded-read regression surfaces as
  // dist/render-to-string/runtime-core frames and "- " stack lines. None appear.
  expect(frame).not.toContain("render-to-string");
  expect(frame).not.toContain("runtime-core");
  expect(frame).not.toContain("dist/");
  expect(frame).not.toMatch(/^\s*- /m);
});

test("stack origin pointing at a DIRECTORY renders header-only without leaking EISDIR", async () => {
  // A crafted/stale `.stack` can parse to an existing DIRECTORY path. Before the
  // fix, ErrorOverview's excerpt block did `fs.existsSync(dir)` (true for a dir) →
  // `fs.readFileSync(dir)` throws EISDIR DURING render. The boundary then re-faults
  // and repaints an overview for the EISDIR error while waitUntilExit() rejects with
  // the ORIGINAL message — a displayed-vs-rejected DISAGREEMENT (violates e17). With
  // the excerpt read guarded, the read failure is swallowed (no excerpt) and the
  // overview renders the header/origin for the original error.
  //
  // We point the first frame at process.cwd() (a real directory on disk) so
  // fs.existsSync passes but fs.readFileSync throws EISDIR.
  const dirPath = cwd();
  const DirStackThrower = defineComponent(() => {
    return () => {
      const e = new Error("Dir stack boom");
      const firstLine = (e.stack ?? "").split("\n")[0] ?? "Error: Dir stack boom";
      // A parseable frame whose file is an existing directory.
      e.stack = `${firstLine}\n    at someFn (${dirPath}:1:1)`;
      throw e;
    };
  });

  const { frame, reject } = await renderFrameAndReject(DirStackThrower);

  // Display: header shows the ORIGINAL message, not an EISDIR error.
  expect(frame).toContain(" ERROR  Dir stack boom");
  expect(frame).not.toContain("EISDIR");
  expect(frame).not.toContain("illegal operation on a directory");

  // Reject: waitUntilExit() rejects with the ORIGINAL Error.
  expect(reject.kind).toBe("rejected");
  if (reject.kind !== "rejected") throw new Error("expected rejection");
  expect(reject.isError).toBe(true);
  expect(reject.message).toBe("Dir stack boom");
  // Consistency: displayed message === rejected message (no EISDIR leakage).
  expect(reject.message).toBe(overviewMessage(frame));
});

test("primitive (non-Error) throw renders ERROR header with no synthetic stack", async () => {
  const frame = await renderErrorFrame(PrimitiveThrower);

  // vue-tui renders String(value) as the message for a primitive throw, so the header
  // shows the thrown text. (Ink renders {error.message}, blank for a primitive that has no
  // .message — see .agents/docs/ink-divergences.md, section "Non-Error thrown values:
  // uniform show-the-error-and-reject".)
  expect(frame).toContain(" ERROR  primitive thrown");

  // A primitive has no .stack, so Ink renders no origin/excerpt/stack block.
  // The synthetic-stack regression would surface as dist/index.mjs or Vue
  // runtime frames and "- " stack-frame lines — assert none appear.
  expect(frame).not.toContain("dist/index.mjs");
  expect(frame).not.toContain("dist/");
  expect(frame).not.toMatch(/^\s*- /m);
});
