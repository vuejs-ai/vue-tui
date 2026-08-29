import assert from "node:assert/strict";
import { Spinner } from "@vue-tui/components";
import { render } from "@vue-tui/testing";
import { defineComponent, h, nextTick, shallowRef } from "vue";

// Vue selects its production error handling at module load time, so this runs in a
// child process. Two paths reject an interval differently there, and only one of them
// can hand a value to setInterval.
const delays = [];
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (callback, delay, ...rest) => {
  delays.push(delay);
  return realSetInterval(callback, delay, ...rest);
};

// Mount: the immediate watcher's getter runs through Vue's error handling, which
// reports and continues, so the callback would receive `undefined`. Reading the
// resolved set in the setup body puts the rejection ahead of the watcher.
const MountsRejected = defineComponent(() => () => h(Spinner, { frames: ["0", "1"], interval: 0 }));
try {
  const rejected = await render(MountsRejected, { columns: 20, rows: 4 });
  rejected.dispose();
} catch {
  // How the rejection surfaces is Vue's error handling; the timer is what matters.
}
assert.deepEqual(
  delays,
  [],
  `a rejected interval started a timer at mount: ${JSON.stringify(delays)}`,
);

// After mount: the same getter runs inside the reactivity scheduler, where the throw
// propagates instead of yielding `undefined`, so the callback never runs at all.
const interval = shallowRef(20);
const Live = defineComponent(
  () => () => h(Spinner, { frames: ["0", "1"], interval: interval.value }),
);
const result = await render(Live, { columns: 20, rows: 4 });
assert.deepEqual(delays, [20], `expected one 20ms timer, got ${JSON.stringify(delays)}`);

interval.value = 0;
try {
  await nextTick();
} catch {
  // The rejection reaches the application through Vue; the timer is what matters here.
}
await new Promise((resolve) => realSetInterval(resolve, 50));
assert.deepEqual(
  delays,
  [20],
  `a rejected interval reached setInterval: ${JSON.stringify(delays)}`,
);

result.dispose();
globalThis.setInterval = realSetInterval;
process.exit(0);
