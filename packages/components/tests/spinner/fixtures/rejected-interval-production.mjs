import assert from "node:assert/strict";
import { Spinner } from "@vue-tui/components";
import { render } from "@vue-tui/testing";
import { defineComponent, h, nextTick, shallowRef } from "vue";

// Vue selects production error handling at module load time.
const delays = [];
const active = new Set();
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
globalThis.setInterval = (_callback, delay) => {
  const handle = delays.push(delay);
  active.add(handle);
  return handle;
};
globalThis.clearInterval = (handle) => active.delete(handle);

let result;
try {
  const Invalid = defineComponent(() => () => h(Spinner, { interval: 0 }));
  try {
    const rejected = await render(Invalid);
    rejected.dispose();
  } catch {
    // The timer assertions hold whether Vue reports or propagates the error.
  }
  assert.deepEqual(delays, []);
  assert.equal(active.size, 0);

  const interval = shallowRef(20);
  const Live = defineComponent(
    () => () => h(Spinner, { frames: ["0", "1"], interval: interval.value }),
  );
  result = await render(Live);
  assert.deepEqual(delays, [20]);
  assert.equal(active.size, 1);

  interval.value = 0;
  try {
    await nextTick();
  } catch {
    // Vue owns propagation of the rejected update.
  }
  assert.deepEqual(delays, [20]);
  assert.equal(active.size, 0, "a rejected update must clear the existing timer");

  interval.value = 40;
  await nextTick();
  assert.deepEqual(delays, [20, 40]);
  assert.equal(active.size, 1);
  result.dispose();
  assert.equal(active.size, 0);
} finally {
  result?.dispose();
  globalThis.setInterval = realSetInterval;
  globalThis.clearInterval = realClearInterval;
}
