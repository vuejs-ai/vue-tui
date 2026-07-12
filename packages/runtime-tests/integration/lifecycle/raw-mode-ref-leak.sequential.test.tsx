// Sequential: drives the raw-mode controller's deferred teardown (microtask +
// queued disable) and asserts on a per-stdin ref balance. File-level parallelism
// could let another app mount/unmount on the shared process and perturb the
// microtask/timer interleaving relative to this test, so we keep it serial.
//
// Bug C: acquireRawMode() called `stdin.ref()` BEFORE `appCtx.setRawMode(true)`.
// On a hostile SSH/container PTY setRawMode(true) raises ERR_TTY_INIT_FAILED —
// the ref() already happened, but `state.refs`/`localRefs` were not yet
// incremented, so dispose()'s unref (gated on refs) never ran. A ref'd stdin
// keeps the event loop alive, so a caller that CATCHES the mount error hangs at
// exit. The fix reorders setRawMode(true) BEFORE stdin.ref() so a throw leaves
// nothing ref'd; this test pins the ref/unref balance after the throw.

import { PassThrough } from "node:stream";
import { defineComponent, h } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { useInternalInputRoutingForTest } from "@vue-tui/runtime/internal";
import { makeFakeWritable } from "./test-streams.ts";

// A fake TTY stdin that COUNTS ref()/unref() calls so we can assert balance, and
// whose setRawMode throws like a broken PTY (ERR_TTY_INIT_FAILED).
function makeRefCountingThrowingStdin(): {
  stream: NodeJS.ReadStream;
  refs: { count: number; refCalls: number; unrefCalls: number };
} {
  const refs = { count: 0, refCalls: 0, unrefCalls: 0 };
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      throw new Error("ERR_TTY_INIT_FAILED");
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as { ref?: () => void }).ref = () => {
    refs.count++;
    refs.refCalls++;
  };
  (s as { unref?: () => void }).unref = () => {
    refs.count--;
    refs.unrefCalls++;
  };
  return { stream: s, refs };
}

test.sequential("a throwing setRawMode during acquire does not leave stdin ref'd (ref/unref balanced)", () => {
  let selectRoute!: () => () => void;
  const App = defineComponent(() => {
    const routing = useInternalInputRoutingForTest();
    const boundary = routing.registerSemantic({
      id: "boundary",
      handle: () => ({
        performed: false,
        continue: true,
        preventDefault: false,
        blockExternal: false,
      }),
    });
    selectRoute = () => routing.select({ activeBoundary: boundary.lease });
    return () => h(Text, null, () => "x");
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin, refs } = makeRefCountingThrowingStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, stderr, liveUpdates: true });
  expect(selectRoute).toThrow("ERR_TTY_INIT_FAILED");

  // The leak guard: a throwing setRawMode must leave the stdin's ref count at 0.
  // Before the fix, ref() ran before the throwing setRawMode and dispose's unref
  // (gated on refs that were never incremented) never fired → count stuck at 1.
  expect(refs.count).toBe(0);

  // Stricter: with setRawMode reordered BEFORE ref(), a throwing setRawMode means
  // ref() is NEVER called (so there is nothing for unref to balance). Pinning both
  // counts at 0 documents that the fix prevents the unbalanced ref rather than
  // merely compensating for it afterwards.
  expect(refs.refCalls).toBe(0);
  expect(refs.unrefCalls).toBe(0);
  app.unmount();
});
