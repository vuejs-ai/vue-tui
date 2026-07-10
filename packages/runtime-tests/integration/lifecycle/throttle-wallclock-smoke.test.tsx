// Production-path smoke test: with NO injected clock, the trailing throttled
// commit must fire on the REAL setTimeout. The precise throttle timing lives
// in throttle.test.tsx on the virtual clock; this test only guards the
// un-injected default path (realClock / direct globals) with margins generous
// enough for a loaded CI runner.

import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable, captureWrites } from "./test-streams.ts";

test("real-clock trailing commit fires without an injected clock", async () => {
  const msg = shallowRef("Hello");
  const App = defineComponent(() => () => <Text>{msg.value}</Text>);
  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false, maxFps: 20 }); // 50ms window
  try {
    await nextTick();
    await nextTick();
    expect(writes.some((w) => w.includes("Hello"))).toBe(true);

    msg.value = "World";
    await nextTick();
    await nextTick();

    // Leading or trailing, the commit must land on the real clock well within
    // this deadline (window is 50ms; 2s absorbs CI starvation).
    const deadline = Date.now() + 2000;
    while (!writes.some((w) => w.includes("World")) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(writes.some((w) => w.includes("World"))).toBe(true);
  } finally {
    app.unmount();
  }
});
