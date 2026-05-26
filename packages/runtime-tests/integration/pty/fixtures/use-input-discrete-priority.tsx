import process from "node:process";
import { createApp, Box, Text, useInput, useExit } from "@vue-tui/runtime";
import { computed, defineComponent, h, onMounted, shallowRef, watch } from "vue";

/**
 * Port of Ink's discrete-priority fixture. The Ink version uses React's
 * useTransition + useMemo to test that rapid input events keep synchronous
 * and deferred state in sync. Vue doesn't have useTransition, so we
 * approximate the deferred behaviour with a watch that schedules a microtask
 * update — the important invariant is that all discrete key events are
 * processed before the deferred state catches up.
 */
const App = defineComponent(() => {
  const exit = useExit();
  const query = shallowRef("abcde");
  const deferredQuery = shallowRef("abcde");
  let done = false;

  // Simulate deferred update: when query changes, schedule deferredQuery
  // update on a microtask (similar to React startTransition).
  watch(query, (newVal) => {
    queueMicrotask(() => {
      deferredQuery.value = newVal;
    });
  });

  useInput((_input, key) => {
    if (key.return) {
      if (done) {
        return;
      }

      done = true;
      process.stdout.write(
        `\nFINAL query:${JSON.stringify(query.value)} deferred:${JSON.stringify(deferredQuery.value)}\n`,
      );
      exit();
      return;
    }

    if (key.backspace || key.delete) {
      query.value = query.value.slice(0, -1);
    }
  });

  const filteredResult = computed(() => {
    if (!deferredQuery.value) {
      return "";
    }

    // Simulate expensive computation that blocks the fiber
    const start = Date.now();
    while (Date.now() - start < 30) {
      // Artificial delay
    }

    return deferredQuery.value;
  });

  onMounted(() => {
    process.stdout.write("__READY__");
  });

  return () =>
    h(Box, { flexDirection: "column" }, () => [
      h(Text, null, `query:${query.value}`),
      h(Text, null, `deferred:${deferredQuery.value}`),
      h(Text, null, `filtered:${filteredResult.value}`),
    ]);
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
