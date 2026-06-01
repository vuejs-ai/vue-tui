import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { makeFakeWritable } from "../lifecycle/test-streams.ts";

// A TTY stdin that records every setRawMode argument and tracks ref()/unref()
// balance, so a test can assert the EXACT terminal ioctls issued across a
// component swap or teardown (not just the observable input behavior).
function makeSpyStdin(): {
  stream: NodeJS.ReadStream;
  setRawModeCalls: boolean[];
  refCount: () => number;
} {
  const setRawModeCalls: boolean[] = [];
  let refs = 0;
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      setRawModeCalls.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {
      refs++;
    },
    unref() {
      refs--;
    },
  });
  return { stream: s, setRawModeCalls, refCount: () => refs };
}

// Drain Vue's render flush AND the microtask queue, so the DEFERRED raw-mode
// disable (queueMicrotask in releaseRawMode) gets a chance to run — the test
// needs to prove it short-circuits, which only shows up after it actually fires.
async function settle() {
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
}

// Ink parity (App.tsx:331-344, pendingDisableRawModeRef): when a useInput
// component is swapped for another in the SAME tick (v-if picks a different
// child type), Vue unmounts the old (releaseRawMode → refs 0 → defers the
// terminal disable to a microtask) THEN mounts the new (acquireRawMode → refs
// back to 0→1). Raw mode is still physically enabled at that moment, so the
// replacement must NOT re-issue stdin.setRawMode(true) or stdin.ref() — Ink
// skips both via its pending-disable flag and cancels the queued disable.
//
// Before the fix vue re-ran both: a redundant setRawMode(true) ioctl AND a
// second ref() whose matching unref never fired (the deferred disable saw
// refs back > 0 and bailed), leaking the libuv ref. This locks one true call.
test("a same-tick useInput swap does not re-issue setRawMode(true) or leak a ref (Ink parity)", async () => {
  const which = shallowRef<"a" | "b">("a");

  const A = defineComponent(() => {
    useInput(() => {});
    return () => <Text>a</Text>;
  });
  const B = defineComponent(() => {
    useInput(() => {});
    return () => <Text>b</Text>;
  });
  const App = defineComponent(() => () => (which.value === "a" ? <A /> : <B />));

  const stdout = makeFakeWritable();
  const { stream: stdin, setRawModeCalls, refCount } = makeSpyStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, debug: true, exitOnCtrlC: false });
  await settle();

  // Baseline: mounting the first useInput enables raw mode exactly once.
  expect(setRawModeCalls).toEqual([true]);
  expect(refCount()).toBe(1);

  // Swap A → B in a single tick. The deferred disable from A's release and B's
  // re-acquire both run before/around the microtask checkpoint.
  which.value = "b";
  await settle();

  // No second setRawMode(true) (raw mode never dropped), no setRawMode(false)
  // either, and the ref balance stays at 1 — exactly Ink's behavior.
  expect(setRawModeCalls).toEqual([true]);
  expect(refCount()).toBe(1);

  app.unmount();
  await settle();

  // Final teardown disables raw mode once and releases the ref.
  expect(setRawModeCalls).toEqual([true, false]);
  expect(refCount()).toBe(0);
});

// The same-tick swap detaches the old component's "data" listener synchronously
// (clearInputState parity) and the replacement re-attaches its own on re-acquire.
// This guards that re-acquire still wires input: a regression that skipped the
// listener re-attach (over-aggressively treating the swap as a pure no-op) would
// leave the replacement deaf.
test("the replacement useInput after a same-tick swap still receives input", async () => {
  const which = shallowRef<"a" | "b">("a");
  const aKeys: string[] = [];
  const bKeys: string[] = [];

  const A = defineComponent(() => {
    useInput((input) => aKeys.push(input));
    return () => <Text>a</Text>;
  });
  const B = defineComponent(() => {
    useInput((input) => bKeys.push(input));
    return () => <Text>b</Text>;
  });
  const App = defineComponent(() => () => (which.value === "a" ? <A /> : <B />));

  const stdout = makeFakeWritable();
  const { stream: stdin } = makeSpyStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, debug: true, exitOnCtrlC: false });
  await settle();

  which.value = "b";
  await settle();

  (stdin as unknown as PassThrough).write("z");
  await settle();

  expect(bKeys).toEqual(["z"]);
  expect(aKeys).toEqual([]); // the unmounted A must not receive it

  app.unmount();
});

// Ink parity (App.tsx:618-631): Ink's unmount-cleanup effect disables raw mode
// SYNCHRONOUSLY when `rawModeEnabledCount > 0 || pendingDisableRawModeRef.current`,
// during React's synchronous unmount. vue defers the disable to a microtask (to
// survive same-tick swaps), but teardown must still force it synchronously —
// otherwise the signal-exit path (teardown(true), which re-raises the signal
// synchronously without draining microtasks) leaves the terminal in raw mode:
// after Ctrl+C the shell stops echoing keystrokes.
//
// This asserts the SYNCHRONOUS checkpoint right after unmount(), with NO await,
// because that is exactly what the signal path observes. Before the fix the
// disable sat in the still-queued microtask (dispose() skipped it because Vue's
// unmount had already zeroed this controller's local ref count); setRawModeCalls
// was [true] at this point and only became [true, false] after a drain.
test("teardown disables raw mode synchronously so a signal exit can't leave the terminal raw (Ink parity)", async () => {
  const App = defineComponent(() => {
    useInput(() => {});
    return () => <Text>listening</Text>;
  });

  const stdout = makeFakeWritable();
  const { stream: stdin, setRawModeCalls, refCount } = makeSpyStdin();

  const app = createApp(App);
  app.mount({ stdout, stdin, debug: true, exitOnCtrlC: false });
  await settle();

  expect(setRawModeCalls).toEqual([true]);
  expect(refCount()).toBe(1);

  // Synchronous unmount — do NOT await. Raw mode must already be disabled at this
  // exact point, the way a synchronous signal-exit teardown would observe it.
  app.unmount();

  expect(setRawModeCalls).toEqual([true, false]);
  expect(refCount()).toBe(0);

  // Draining afterward must not double-disable or over-unref (the queued
  // microtask was cancelled, not left to fire a second setRawMode(false)).
  await settle();
  expect(setRawModeCalls).toEqual([true, false]);
  expect(refCount()).toBe(0);
});
