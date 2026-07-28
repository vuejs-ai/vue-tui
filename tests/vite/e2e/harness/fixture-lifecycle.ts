import type { TuiApp } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";
import type { ComponentPublicInstance } from "vue";
import { FIXTURE_TEST_EVENT } from "./protocol.ts";

export function reportFixtureLifecycle(app: TuiApp): void {
  let root: ComponentPublicInstance | undefined;

  app.mixin({
    mounted() {
      const instance = this as ComponentPublicInstance;
      if (instance.$parent !== null) return;
      root = instance;
      emitTestEvent(FIXTURE_TEST_EVENT.appMounted);
    },
    unmounted() {
      const instance = this as ComponentPublicInstance;
      if (instance !== root) return;
      root = undefined;
      emitTestEvent(FIXTURE_TEST_EVENT.appUnmounted);
    },
  });

  void app.waitUntilExit().then(
    () => emitTestEvent(FIXTURE_TEST_EVENT.appExit, { code: 0 }),
    () => emitTestEvent(FIXTURE_TEST_EVENT.appExit, { code: 1 }),
  );
}
