import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { createApp, Text, useInput } from "@vue-tui/runtime";
import { makeTrackedStreams, PASTE_OFF, PASTE_ON } from "./harness.ts";

describe("semantic input terminal ownership", () => {
  test("multiple active handlers share one paste/raw lifetime", async () => {
    const streams = makeTrackedStreams();
    const firstActive = shallowRef(true);
    const secondActive = shallowRef(true);
    const App = defineComponent(() => {
      useInput(() => undefined, { isActive: firstActive });
      useInput(() => undefined, { isActive: secondActive });
      return () => <Text>listening</Text>;
    });
    const app = createApp(App);

    try {
      app.mount({
        stdin: streams.stdin,
        stdout: streams.stdout,
        stderr: streams.stderr,
        patchConsole: false,
      });
      await nextTick();
      expect(streams.rawModeCalls).toEqual([true]);
      expect(streams.stdoutWrites.filter((write) => write === PASTE_ON)).toHaveLength(1);

      firstActive.value = false;
      await nextTick();
      await Promise.resolve();
      expect(streams.rawModeCalls).toEqual([true]);
      expect(streams.stdoutWrites).not.toContain(PASTE_OFF);

      secondActive.value = false;
      await nextTick();
      await Promise.resolve();
      expect(streams.rawModeCalls).toEqual([true, false]);
      expect(streams.stdoutWrites.filter((write) => write === PASTE_OFF)).toHaveLength(1);
    } finally {
      app.unmount();
      streams.destroy();
    }
  });
});
