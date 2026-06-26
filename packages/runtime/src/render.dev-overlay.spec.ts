import { test, expect } from "vite-plus/test";
import { connectDevtools, devState } from "./hmr.ts";
import { createApp } from "./render.ts";
import { Text } from "./index.ts";
import { defineComponent, h } from "vue";

test("dev overlay activates when connectDevtools was called (no build-define)", async () => {
  const out: string[] = [];
  const stdout = {
    write: (s: string) => (out.push(s), true),
    isTTY: false,
  } as unknown as NodeJS.WriteStream;
  connectDevtools({ on: () => {}, send: () => {} });
  const app = createApp(defineComponent(() => () => h(Text, null, () => "hi")));
  // Set devState AFTER createApp: createApp calls resetDevState() to clear any
  // stale state from a previous app instance; the overlay itself is reactive and
  // will render the error on the next paint cycle.
  devState.value = { type: "error", error: { message: "BUILD-FAIL-XYZ" } };
  app.mount({ stdout, debug: true });
  await Promise.resolve();
  expect(out.join("")).toContain("BUILD-FAIL-XYZ"); // overlay rendered the error
  app.unmount();
});
