import { test, expect } from "vite-plus/test";
import type { Plugin } from "vite";
import { forceVueJsxClientCompile } from "../src/force-vue-jsx-client-compile.ts";

type Hook = (this: unknown, ...args: unknown[]) => unknown;

test("forceVueJsxClientCompile patches function and object hooks", () => {
  const seenSsr: Array<boolean | undefined> = [];
  const plugin = {
    name: "vite:vue-jsx",
    transform(this: unknown, _code: string, _id: string, opts?: { ssr?: boolean }) {
      seenSsr.push(opts?.ssr);
      return null;
    },
    load: {
      handler(this: unknown, _id: string, opts?: { ssr?: boolean }) {
        seenSsr.push(opts?.ssr);
        return null;
      },
    },
  } as unknown as Plugin & {
    transform: Hook;
    load: { handler: Hook };
  };

  forceVueJsxClientCompile(plugin);
  plugin.transform.call({}, "code", "id.tsx", { ssr: true });
  plugin.load.handler.call({}, "id.tsx", { ssr: true });

  expect(seenSsr).toEqual([false, false]);
});

test("forceVueJsxClientCompile does NOT mutate the caller's shared options object", () => {
  const plugin = {
    name: "vite:vue-jsx",
    transform: {
      handler(this: unknown, _code: string, _id: string, _opts?: { ssr?: boolean }) {
        return null;
      },
    },
  } as unknown as Plugin & {
    transform: { handler: Hook };
  };

  forceVueJsxClientCompile(plugin);
  const shared = { ssr: true };
  plugin.transform.handler.call({}, "code", "id.tsx", shared);

  // Vite reuses this options object for the transform hooks of plugins ordered AFTER
  // vue-jsx, so flipping ssr in place would leak ssr:false to them.
  expect(shared.ssr).toBe(true);
});

test("forceVueJsxClientCompile is idempotent", () => {
  let calls = 0;
  const originalTransform: Hook = function () {
    calls += 1;
    return null;
  };
  const plugin = {
    name: "vite:vue-jsx",
    transform: originalTransform,
  } as unknown as Plugin & {
    transform: Hook;
  };

  forceVueJsxClientCompile(plugin);
  const oncePatched = plugin.transform;
  forceVueJsxClientCompile(plugin);

  expect(plugin.transform).toBe(oncePatched);
  plugin.transform.call({}, "code", "id.tsx", { ssr: true });
  expect(calls).toBe(1);
});
