import { test, expect } from "vite-plus/test";
import { forceClientCompile } from "./force-client-compile.ts";

test("forceClientCompile forces ssr:false on the transform hook's options arg", () => {
  let seenSsr: boolean | undefined;
  const plugin = {
    name: "vue",
    transform(this: unknown, _code: string, _id: string, opts?: { ssr?: boolean }) {
      seenSsr = opts?.ssr;
      return null;
    },
  } as unknown as import("vite").Plugin;
  forceClientCompile(plugin);
  // @ts-expect-error call the wrapped hook directly
  plugin.transform.call({}, "code", "id.vue", { ssr: true });
  expect(seenSsr).toBe(false);
});
