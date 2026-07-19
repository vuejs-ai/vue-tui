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
  "v-show preserves a stateful subtree and republishes its %s target state",
  async (mode) => {
    resetVShowJourneyState();
    const visible = shallowRef(true);
    const revision = shallowRef(0);
    const targetKey = shallowRef(0);
    const authoredDisplay = shallowRef<"flex" | "none">("flex");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <VShowJourney
          visible={visible.value}
          pointer={mode === "fullscreen"}
          revision={revision.value}
          targetKey={targetKey.value}
          authoredDisplay={authoredDisplay.value}
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
      expect(vShowJourneyState.focus?.focus()).toBe(true);
      await flushUpdate(result);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);
      expect(vShowJourneyState.caret?.value.status).toBe("visible");

      if (mode === "fullscreen") {
        expect(result.mouse.reporting.current).toBe("button");
        await result.mouse.down({ x: 0, y: 0 });
        await result.mouse.up({ x: 0, y: 0 });
        expect(vShowJourneyState.clicks?.value).toBe(1);
      }

      visible.value = false;
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      expect(vShowJourneyState.mounts).toBe(1);
      expect(vShowJourneyState.unmounts).toBe(0);
      expect(vShowJourneyState.focus?.isFocused.value).toBe(false);
      expect(vShowJourneyState.size?.value).toBeNull();
      expect(vShowJourneyState.caret?.value.status).not.toBe("visible");
      if (mode === "fullscreen") {
        expect(result.mouse.reporting.current).toBe("none");
        await expect(result.mouse.down({ x: 0, y: 0 })).rejects.toThrow("without button reporting");
      }

      // Box's authored display and v-show are independent layers. Updating the
      // prop while the directive remains false must not reveal the subtree.
      authoredDisplay.value = "none";
      await flushUpdate(result);
      expect(result.lastFrame()).toBe("tail");
      authoredDisplay.value = "flex";
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
      expect(vShowJourneyState.focus?.isFocused.value).toBe(true);
      expect(vShowJourneyState.size?.value).toEqual({ width: 12, height: 1 });
      expect(vShowJourneyState.caret?.value).toEqual({
        status: "visible",
        surface: { x: 4, y: 0 },
      });
      if (mode === "fullscreen") {
        expect(result.mouse.reporting.history).toEqual(["button", "none", "button"]);
        // The keyed replacement moved from x=0 to x=4. The old hit-map cell is
        // inert; the current target receives exactly one click.
        await result.mouse.down({ x: 0, y: 0 });
        await result.mouse.up({ x: 0, y: 0 });
        expect(vShowJourneyState.clicks?.value).toBe(1);
        await result.mouse.down({ x: 4, y: 0 });
        await result.mouse.up({ x: 4, y: 0 });
        expect(vShowJourneyState.clicks?.value).toBe(2);
      }

      result.unmount();
      expect(vShowJourneyState.unmounts).toBe(1);
      expect(vShowJourneyState.size?.value).toBeNull();
      expect(vShowJourneyState.caret?.value).toEqual({ status: "inactive" });
      if (mode === "fullscreen") {
        expect(result.mouse.reporting.history).toEqual(["button", "none", "button", "none"]);
      }
    } finally {
      result.dispose();
    }
  },
);
