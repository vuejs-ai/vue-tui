// Sequential: these tests assert on the raw-mode controller's deferred teardown,
// which is driven by queueMicrotask + a real 20ms pending-escape flush timer.
// File-level parallelism can perturb the microtask/timer interleaving relative to
// other apps mounting/unmounting on the shared process, so we keep them serial.

import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import type { InternalMountOptions } from "../../../runtime/dist/internal.mjs";
import { makeFakeWritable } from "./test-streams.ts";

// A fake stdin that, like a real PTY, reflects the last setRawMode call in `isRaw`
// AND records every setRawMode call in `history`. The shared test-streams stdin
// does not track `isRaw`, which hides the prevRaw re-capture corruption (FIX B):
// on a real terminal, a deferred setRawMode(false) leaves isRaw=true, so a same-
// tick re-acquire snapshots prevRaw=true.
function makeRawTrackingStdin(): {
  stream: NodeJS.ReadStream;
  rawMode: { current: boolean; history: boolean[] };
} {
  const rawMode = { current: false, history: [] as boolean[] };
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      (this as { isRaw: boolean }).isRaw = mode;
      rawMode.current = mode;
      rawMode.history.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as { ref?: () => void }).ref = () => {};
  (s as { unref?: () => void }).unref = () => {};
  return { stream: s, rawMode };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// FIX A (P6): a same-tick useInput swap must not leak buffered parser state into
// the replacement. Ink clears input state synchronously on the last release
// (clearInputState — App.tsx:212-216) and defers only the terminal toggle.
// Port of Ink test/components.tsx:855-909.
test.sequential("swapping useInput components clears pending parser state (no leaked partial escape)", async () => {
  const receivedByB: TuiInputEvent[] = [];
  const showA = shallowRef(true);

  const StepA = defineComponent(() => {
    useInput(() => undefined);
    return () => h(Text, null, () => "A");
  });

  const StepB = defineComponent(() => {
    useInput((event) => {
      receivedByB.push(event);
    });
    return () => h(Text, null, () => "B");
  });

  const Root = defineComponent(() => {
    return () => (showA.value ? h(StepA, { key: "a" }) : h(StepB, { key: "b" }));
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeRawTrackingStdin();

  const app = createApp(Root);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);
  await nextTick();

  // Buffer a partial escape sequence (CSI start, no final byte). The parser
  // holds "\x1b[" as pending and schedules a 20ms flush timer.
  stdin.emit("data", "\x1b[");

  // Swap StepA -> StepB in the same tick: A unmounts (refs -> 0, queues the
  // deferred disable), B mounts (refs 0 -> 1, re-attaches the data listener).
  showA.value = false;
  await nextTick();

  // Let the queued microtask AND the 20ms pending-escape flush run.
  await Promise.resolve();
  await wait(40);

  // Ink: the replacement receives nothing — the stale "\x1b[" must not leak.
  expect(receivedByB).toEqual([]);

  app.unmount();
});

// FIX B (P7): after a sync setRawMode(false)->(true) swap then teardown, the
// terminal must be restored (final setRawMode call is false). The previous
// prevRaw-restore would re-capture prevRaw=true while raw mode was still active
// (deferred disable), leaving the terminal in raw mode on exit. Ink unconditionally
// setRawMode(false) on disable (App.tsx:218-222).
test.sequential("final raw-mode teardown restores the terminal (setRawMode(false)) after a sync re-acquire swap", async () => {
  const active = shallowRef(true);

  // Two useInput components: dropping one and adding another in the same tick is
  // a release(false)+acquire(true) cycle while the deferred disable is pending.
  const Listener = defineComponent(() => {
    useInput(() => undefined);
    return () => h(Text, null, () => "x");
  });

  const Root = defineComponent(() => {
    return () => (active.value ? h(Listener, { key: "a" }) : h(Listener, { key: "b" }));
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin, rawMode } = makeRawTrackingStdin();

  const app = createApp(Root);
  app.mount({ stdout, stdin, stderr, maxFps: 0 } as InternalMountOptions);
  await nextTick();

  expect(rawMode.current).toBe(true);

  // Sync swap: release -> acquire in the same tick. With the old code,
  // acquireRawMode re-captures prevRaw from the still-true isRaw -> prevRaw=true.
  active.value = false;
  await nextTick();
  await Promise.resolve();

  // Raw mode must still be on across the swap (the deferred toggle is the whole
  // reason for the microtask — never break this).
  expect(rawMode.current).toBe(true);

  // Now tear down. The final disable must leave the terminal NOT in raw mode.
  app.unmount();
  await Promise.resolve();
  await wait(5);

  expect(rawMode.current).toBe(false);
  expect(rawMode.history.at(-1)).toBe(false);
});
