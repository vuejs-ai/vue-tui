<script setup lang="ts">
import { onScopeDispose } from "vue";
import { Text } from "@vue-tui/runtime";
import { useInternalInputRoutingForTest } from "@vue-tui/runtime/internal";

const generation = "A";
const testGlobal = globalThis as {
  __VT_INPUT_ACTIVE_MOUNT__?: number;
  __VT_INPUT_CALLS__?: string[];
  __VT_INPUT_SETUPS__?: string[];
  __VT_INPUT_START__?: () => void;
  __VT_INPUT_STOP__?: () => void;
};
const mountGeneration = testGlobal.__VT_INPUT_ACTIVE_MOUNT__;
if (mountGeneration === undefined) throw new Error("missing input HMR mount generation");
const routing = useInternalInputRoutingForTest();
let stopRoute = () => {};
const startRoute = () => {
  stopRoute();
  const boundary = routing.registerSemantic({
    id: `input-hmr:${mountGeneration}:${generation}`,
    handle(fact) {
      testGlobal.__VT_INPUT_CALLS__?.push(`${mountGeneration}:${generation}:${fact.sequence}`);
      return {
        performed: true,
        continue: true,
        preventDefault: false,
        blockExternal: false,
      };
    },
  });
  const endSelection = routing.select({ activeBoundary: boundary.lease });
  let stopped = false;
  stopRoute = () => {
    if (stopped) return;
    stopped = true;
    endSelection();
    boundary.end();
  };
  testGlobal.__VT_INPUT_STOP__ = stopRoute;
};
testGlobal.__VT_INPUT_START__ = startRoute;
startRoute();
testGlobal.__VT_INPUT_SETUPS__?.push(`${mountGeneration}:${generation}`);

onScopeDispose(() => {
  stopRoute();
  if (testGlobal.__VT_INPUT_START__ === startRoute) delete testGlobal.__VT_INPUT_START__;
  if (testGlobal.__VT_INPUT_STOP__ === stopRoute) delete testGlobal.__VT_INPUT_STOP__;
});
</script>

<template>
  <Text>INPUT-LABEL-A generation={{ mountGeneration }}:{{ generation }}</Text>
</template>
