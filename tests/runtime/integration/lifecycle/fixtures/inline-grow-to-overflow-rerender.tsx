import process from "node:process";
import { Box, Text, createApp, useApp } from "@vue-tui/runtime";
import { Fragment, defineComponent, h, onScopeDispose, shallowRef, watch } from "vue";

const rows = Number(process.argv[2]) || 3;
// This fixture must own the real stdout stream so the parent can inspect terminal-clearing bytes.
process.stdout.rows = rows;

const App = defineComponent(() => {
  const { exit } = useApp();
  const frameCount = shallowRef(0);
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    frameCount,
    (count) => {
      clearTimeout(timer);
      if (count >= 1) {
        timer = setTimeout(() => {
          exit();
        }, 0);
        return;
      }
      timer = setTimeout(() => {
        frameCount.value++;
      }, 100);
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    clearTimeout(timer);
  });

  return () => {
    const targetHeight = frameCount.value === 0 ? rows - 1 : rows + 1;
    return h(Fragment, [
      h(Box, { height: targetHeight, flexDirection: "column" }, () => [
        h(Text, null, () => "#450 top"),
        h(Box, { flexGrow: 1 }, () => h(Text, null, () => `frame ${frameCount.value}`)),
        h(Text, null, () => "#450 bottom"),
      ]),
    ]);
  };
});

createApp(App).mount({ color: false });
