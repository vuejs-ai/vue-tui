import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import { render, type RenderResult } from "@vue-tui/testing";
import VShowJourney, { resetVShowJourneyState, vShowJourneyState } from "./v-show-journey.ts";

async function flushUpdate(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

test.each(["inline", "fullscreen"] as const)(
  "v-show preserves a stateful subtree and invalidates its %s focus target",
  async (mode) => {
    resetVShowJourneyState();
    const visible = shallowRef(true);
    const revision = shallowRef(0);
    const targetKey = shallowRef(0);
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <VShowJourney
          visible={visible.value}
          revision={revision.value}
          targetKey={targetKey.value}
        />
        <Text>tail</Text>
      </Box>
    ));
    const result = await render(App, {
      columns: 20,
      rows: 8,
      host: { mode },
    });

    try {
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);
      expect(result.lastFrame()).toBe("probe:0\ntail");
      expect(vShowJourneyState.size?.value).toEqual({ width: 12, height: 1 });
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.value).toBeNull();

      // Reactive state and the rendered target can both change while the
      // directive keeps the mounted subtree out of layout and paint.
      revision.value = 2;
      targetKey.value = 1;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      expect(vShowJourneyState.value?.value).toBe(2);
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);

      visible.value = true;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("    probe:2\ntail");
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.value).toEqual({ width: 12, height: 1 });
      vShowJourneyState.focus?.focus();
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);
      result.unmount();
      expect(vShowJourneyState.unmounts).toBe(1);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.value).toBeNull();
    } finally {
      result.dispose();
    }
  },
);
