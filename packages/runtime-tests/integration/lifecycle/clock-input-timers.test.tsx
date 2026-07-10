// The two input-side runtime timers — the bare-escape pending flush (20ms)
// and the kitty support-detection timeout (200ms) — must run on the injected
// clock (see .agents/docs/clock.md), so input tests can advance virtual time
// instead of sleeping real milliseconds.

import { defineComponent, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput, type Key, type TuiApp } from "@vue-tui/runtime";
import {
  createKittyKeyboardController,
  createVirtualClock,
  INTERNAL_CLOCK,
} from "@vue-tui/runtime/internal";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const drain = () => new Promise<void>((resolve) => setImmediate(resolve));

test("bare-escape pending flush fires on the injected clock", async () => {
  const clock = createVirtualClock();
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  app.mount({
    stdout,
    stdin,
    stderr,
    exitOnCtrlC: false,
    [INTERNAL_CLOCK]: clock,
  } as Parameters<TuiApp["mount"]>[0]);
  await nextTick();
  await drain();
  try {
    stdin.emit("data", "\x1b");
    await drain();
    // The bare escape is held as a pending sequence prefix — not delivered yet.
    expect(calls).toHaveLength(0);
    // 20 virtual ms later the pending-flush timer fires and delivers Escape.
    await clock.advance(20);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.key.escape).toBe(true);
  } finally {
    app.unmount();
  }
});

test("kitty detection timeout runs on the injected clock", async () => {
  const clock = createVirtualClock();
  const stdout = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const controller = createKittyKeyboardController(stdin, stdout, clock);
  controller.init({ mode: "auto" }, true);
  // Detection armed: the query-response listener is attached and the
  // no-response timeout sits in the injected clock's ledger.
  expect(stdin.listenerCount("data")).toBe(1);
  expect(clock.pendingTimers()).toHaveLength(1);
  // 200 virtual ms with no response: cleanup detaches the listener and the
  // protocol stays disabled.
  await clock.advance(200);
  expect(stdin.listenerCount("data")).toBe(0);
  expect(controller.isEnabled).toBe(false);
});
