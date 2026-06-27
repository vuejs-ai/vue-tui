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

test("forceClientCompile does NOT mutate the caller's shared options object", () => {
  const plugin = {
    name: "vue",
    transform(this: unknown, _code: string, _id: string, _opts?: { ssr?: boolean }) {
      return null;
    },
  } as unknown as import("vite").Plugin;
  forceClientCompile(plugin);
  const shared = { ssr: true };
  // @ts-expect-error call the wrapped hook directly
  plugin.transform.call({}, "code", "id.vue", shared);
  // Vite reuses this options object for the transform hooks of plugins ordered AFTER
  // vue/vue-jsx, so flipping ssr in place would leak ssr:false to them. The wrapper must
  // clone the options, not mutate the shared object.
  expect(shared.ssr).toBe(true);
});
